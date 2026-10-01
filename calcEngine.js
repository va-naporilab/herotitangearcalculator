// calcEngine.js
// 計算エンジン本体。index.html の GameCalculator 内 useMemo から切り出した純粋関数。
// ・React / DOM / state に一切依存しない（入力 → 出力のみ）
// ・index.html からは calculateAll({...}) を呼び出すだけ
//
// 【依存するグローバル（先に読み込むこと）】
//   heroData.js   : heroData, exclusiveMultipliers, resolveAsDamage, resolveShieldBuff,
//                   resolveOpeningShield, awakeningSkill1Shield, awakeningSkill1AsDamage,
//                   AWAKENING_SKILL3_REACTIVATION_DAMAGE / _RATE など
//   constants.js  : soldierData, getDebuffRate, titanEffects, slotNames など
//
// 【入力】
//   buffs, compatibility, heroes, titanEquip, titanEnabled,
//   awakeningEnabled, powerRoundWeights, durabilityRoundWeights, awakening
// 【出力】
//   従来の `calculations` と同一のオブジェクト（＋下記のダメージ台帳）
//
// 【ダメージ台帳 damageLedger（追加）】
//   calculations.damageLedger            … タイタン反映後（withTitan）
//   calculations.damageLedgerWithoutTitan … タイタン無し
//   最終集計（追撃総ダメージ=AS / パッシブダメージ=PS）に入る全項目に、由来のタグを付けた記録。
//     entries[] : { hero, heroIndex, phase, kind, origin, source, slot, value, heartbeat, share }
//       hero   : 英雄名（通常攻撃など英雄に属さないものは null）
//       phase  : 'AS' | 'PS'（実際に加算された集計先。アカネ・フェルムのPS磁気はAS側に入る。PS脆弱はPS側）
//       kind   : 'direct' | 'magnetic' | 'burning' | 'vulnerable'
//       origin : 'base' | 'hero' | 'titan' | 'awakening'
//     byPhase / byKind / byPhaseKind / byOrigin / byHero … 集計済みの合計
//   ※ AS合計・PS合計は totalASDamage / passiveDamage と一致する（検証済み）

// ダメージ台帳の集計ヘルパー：index.html から読みやすい形にまとめる
// 戻り値: { entries, total, byPhase, byKind, byPhaseKind, byOrigin, byHero, meta }
//   entries[]   : { hero, heroIndex, phase, kind, origin, source, slot, value, share(総火力に対する割合) }
//   byHero      : 英雄名 → { total, AS, PS, direct, magnetic, burning, vulnerable }（英雄に属さないものは '共通'）
function summarizeDamageLedger(rawEntries, meta) {
  const zeroKinds = () => ({ direct: 0, magnetic: 0, burning: 0, vulnerable: 0 });
  const total = rawEntries.reduce((s, e) => s + e.value, 0);
  const byPhase = { AS: 0, PS: 0 };
  const byKind = zeroKinds();
  const byPhaseKind = { AS: zeroKinds(), PS: zeroKinds() };
  const byOrigin = { base: 0, hero: 0, titan: 0, awakening: 0 };
  const byHero = {};
  const entries = rawEntries.map(e => {
    byPhase[e.phase] += e.value;
    byKind[e.kind] += e.value;
    byPhaseKind[e.phase][e.kind] += e.value;
    byOrigin[e.origin] += e.value;
    const key = e.hero || '共通';
    if (!byHero[key]) byHero[key] = { total: 0, AS: 0, PS: 0, ...zeroKinds() };
    byHero[key].total += e.value;
    byHero[key][e.phase] += e.value;
    byHero[key][e.kind] += e.value;
    return { ...e, share: total > 0 ? e.value / total : 0 };
  });
  return { entries, total, byPhase, byKind, byPhaseKind, byOrigin, byHero, meta: { ...meta } };
}

function calculateAll({
  buffs,
  compatibility,
  heroes,
  titanEquip,
  titanEnabled,
  awakeningEnabled,
  powerRoundWeights,
  durabilityRoundWeights,
  awakening
}) {
  // 兵種の不一致チェック（外す・未実装を除く有効な英雄のみ）
  const heroTypes = heroes
    .filter(h => h.name !== '外す' && heroData[h.name] && !heroData[h.name].name)
    .map(h => heroData[h.name].type)
    .filter(t => t && t !== '汎用');
  const uniqueTypes = [...new Set(heroTypes)];
  const typeWarning = uniqueTypes.length > 1 ? '⚠️ 英雄の兵種が異なります（混成編成）' : '';

  const soldier = soldierData[buffs.soldierLv || 0];
  
  // バフ相性計算
  // 火力乖離係数を攻撃に適用
  const attackWithDivergence = ((buffs.attack || 0) + 100) * (buffs.powerDivergenceCoef || 1);
  const damageIncreaseCoeff = ((buffs.damageIncrease || 0) + 100) / 100;
  
  // 相性なしの基本値
  const baseCompatDurability = ((buffs.life || 0) + 100) / 100 * ((buffs.damageReduction || 0) + 100) / 100 * ((buffs.defense || 0) + 100) / 100;
  const baseCompatPower = (attackWithDivergence / 100) * damageIncreaseCoeff;
  
  let compatDurability = baseCompatDurability;
  let compatPower = baseCompatPower;
  
  // 兵種相性条件による火力・耐久補正
  // 【現状】「同兵種」「相性不利」は同一の基本値（補正なし）として扱う。
  // 将来的にそれぞれ個別の補正を設ける場合は、以下の各elseブロックに条件を追加する。
  if (compatibility === '相性有利') {
    // 相性有利時の火力補正
    compatPower = ((attackWithDivergence + (buffs.typeAdvantage || 0)) / 100) * damageIncreaseCoeff;
    // 相性有利時の耐久補正
    compatDurability = compatDurability * ((buffs.typeAdvantage || 0) + 100) / 100;
  } else if (compatibility === '相性不利') {
    // 相性不利時（現状は補正なし＝基本値のまま。将来の拡張ポイント）
    compatPower = baseCompatPower;
    compatDurability = baseCompatDurability;
  } else {
    // 同兵種（現状は補正なし＝基本値のまま。将来の拡張ポイント）
    compatPower = baseCompatPower;
    compatDurability = baseCompatDurability;
  }
  
  const compatStrength = compatPower * compatDurability;
  const baseCompatStrength = baseCompatPower * baseCompatDurability;
  const compatTroopDurability = compatDurability * (buffs.troops || 0);
  const baseCompatTroopDurability = baseCompatDurability * (buffs.troops || 0);
  const compatTroopPower = compatPower * (buffs.troops || 0);
  const baseCompatTroopPower = baseCompatPower * (buffs.troops || 0);
  const compatTroopStrength = compatTroopDurability * compatTroopPower;
  const baseCompatTroopStrength = baseCompatTroopDurability * baseCompatTroopPower;
  const compatTroopSoldierDurability = compatTroopDurability * soldier.durability * 1000000000; // 1B掛ける
  const baseCompatTroopSoldierDurability = baseCompatTroopDurability * soldier.durability * 1000000000;
  const compatTroopSoldierPower = compatTroopPower * soldier.power * 1000000000; // 1B掛ける
  const baseCompatTroopSoldierPower = baseCompatTroopPower * soldier.power * 1000000000;
  // 強さ値は1B^2がかからないように計算
  const compatTroopSoldierStrength = (compatTroopSoldierDurability / 1000000000) * (compatTroopSoldierPower / 1000000000);
  const baseCompatTroopSoldierStrength = (baseCompatTroopSoldierDurability / 1000000000) * (baseCompatTroopSoldierPower / 1000000000);

  // タイタン効果の計算（ON/OFF両方）
  const calculateHeroStats = (useTitan) => {
    let totalAttackBuff = 0;
    let totalShieldBuff = buffs.baseShield;
    let totalASDamage = 0;
    
    // 直接ダメージ追跡（脆弱計算用）
    let totalDirectDamage = 0;
    let totalDirectBullets = 0;
    
    // 脆弱ダメージ追跡（属性別に別々に集計）
    //  ・AS属性の脆弱（タイタン破凱・マゼリア）: totalASVulnerableDamage。AS集計(totalASDamage)に入る。
    //  ・PS属性の脆弱（ノーラ・アデル／ソフィ・ヒヨリ／アリア＆ティナ）: totalPSVulnerableDamage。
    //    PS集計(totalPSDamage)に入り、属性は直接ダメージ(totalDirectDamage)側で計上する（脆弱側の合計には入れない）。
    // どちらも総火力(totalASDamage + passiveDamage)には1回だけ入る。下の集計変数同士を足し合わせる際の二重計上に注意。
    let totalASVulnerableDamage = 0;
    let totalPSVulnerableDamage = 0;
    
    // AS直接ダメージ追跡（追撃火力比率計算用、磁気・燃焼・脆弱を除外。AS脆弱は totalASVulnerableDamage に別集計）
    let totalASDirectDamage = 0;
    let totalASDirectBullets = 0;
    
    // AS弾数追跡（追撃火力比率計算用）
    let totalASBullets = 0;

    // 磁気・燃焼ダメージ追跡（依存率表示用。追撃総ダメージ・パッシブダメージ双方から発生しうる）
    let totalMagneticDamage = 0;
    let totalBurningDamage = 0;
    // ===== ダメージ台帳：最終集計(totalASDamage / totalPSDamage)に入る各項目へのタグ付き記録 =====
    //  hero   : 由来の英雄名（通常攻撃など英雄に属さないものは null）
    //  idx    : 編成内の位置（同名英雄の区別用）
    //  phase  : 実際に加算された集計先 'AS'(追撃総ダメージ) | 'PS'(パッシブダメージ)
    //  kind   : 'direct'(直接) | 'magnetic'(磁気) | 'burning'(燃焼) | 'vulnerable'(脆弱：AS側の破凱・マゼリア・全軍突撃分のみ。PS脆弱は PS/direct)
    //  origin : 'base'(通常攻撃) | 'hero'(英雄スキル) | 'titan'(タイタン装備) | 'awakening'(覚醒スキル)
    //  source : 効果名ラベル / slot : タイタン装備の部位 / value : 加算された値（鼓動反映後）
//  heartbeat : 鼓動の係数が掛かった項目か。鼓動は通常攻撃と連撃にのみ作用する（他のPSには作用しない）
    // ※既存の集計変数への加算はそのまま。各加算の直後に記録だけを足している（計算値には影響しない）
    const damageLedger = [];
    const damageLedgerMeta = { heartbeatCoeff: 1, heartbeatTargets: ['通常攻撃', '連撃'] };
    const ledgerAdd = ({ hero = null, idx = null, phase, kind, origin, source, value, slot = null }) => {
      const entry = { hero, heroIndex: idx, phase, kind, origin, source, slot, value, heartbeat: false };
      damageLedger.push(entry);
      return entry;
    };

    // 敵の異常ダメージ軽減：磁気・燃焼ダメージ全てに 1 / (1 + 軽減値/100) を適用
    const abnormalReductionDivisor = 1 + ((buffs.enemyAbnormalDamageReduction || 0) / 100);
    
    // 通常攻撃の兵種別計算
    let basicAttackBullets = 0;  // 通常攻撃弾数を保存
    const getBasicAttack = () => {
      const types = heroes.map(h => heroData[h.name]?.type).filter(t => t && t !== '汎用');
      const uniqueTypes = [...new Set(types)];
      
      // 海軍のみ、空軍のみ、海軍と汎用のみ、空軍と汎用のみ
      if (uniqueTypes.length === 1 && (uniqueTypes[0] === '海軍' || uniqueTypes[0] === '空軍')) {
        basicAttackBullets = 3;
        totalDirectBullets += 3;
        return 40 * 3; // 120%
      }
      // 陸軍のみ、陸軍と汎用のみ
      if (uniqueTypes.length === 1 && uniqueTypes[0] === '陸軍') {
        basicAttackBullets = 1;
        totalDirectBullets += 1;
        // 100% × (ダメ増 + 100 + 17) / (ダメ増 + 100)
        return 100 * (buffs.damageIncrease + 100 + 17) / (buffs.damageIncrease + 100);
      }
      // その他
      basicAttackBullets = 2.3;
      totalDirectBullets += 2.3;
      return 50 * 2.3; // 115%
    };
    
    const basicAttackDamage = getBasicAttack();
    totalDirectDamage += basicAttackDamage;
    let totalPSDamage = basicAttackDamage;
    const basicAttackEntry = ledgerAdd({ hero: null, idx: null, phase: 'PS', kind: 'direct', origin: 'base', source: '通常攻撃', value: basicAttackDamage });
    let maxIronWall = 0;
    let maxIronWallExLv = 0;
    let hasIronWall = false;
    let totalInsightValue = 0;
    let totalElusivenessValue = 0;

    const artilleryBoosts = heroes.map((hero, i) => {
      if (!useTitan) return 0;
      let boost = 0;
      titanEquip[i].forEach((equip, slotIdx) => {
        if (equip.effect === '砲撃の嵐') {
          const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '砲撃の嵐');
          if (effect && effect.levels && effect.levels[equip.level - 1] !== undefined) {
            boost += effect.levels[equip.level - 1];
          }
        }
      });
      return boost;
    });

    const steelBoosts = heroes.map((hero, i) => {
      if (!useTitan) return 0;
      let boost = 0;
      titanEquip[i].forEach((equip, slotIdx) => {
        if (equip.effect === '鋼の奔流') {
          const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '鋼の奔流');
          if (effect && effect.levels && effect.levels[equip.level - 1] !== undefined) {
            boost += effect.levels[equip.level - 1];
          }
        }
      });
      return boost;
    });

    // グローバル磁気効果強化（全英雄の磁気に適用）
    let globalMagneticBoost = 0;
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (data && data.magneticBoost) {
        globalMagneticBoost += data.magneticBoost(hero.exclusiveLv);
      }
    });

    // グローバル燃焼効果強化（全英雄の燃焼に適用）
    let globalBurningBoost = 0;
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (data && data.burningBoost) {
        globalBurningBoost += data.burningBoost(hero.exclusiveLv);
      }
      
      // ルチルのPS燃焼強化（ラウンドごと、火力重み係数で平均）
      // リヴィア/ユズハ/ノルシュ/リヴィア（神秘）との同時編成時に完全な値を返す
      if (hero.name === 'ルチル' && data.psBurningBoostPerRound) {
        const hasRivvia = heroes.some(h => h.name === 'リヴィア');
        const hasYuzuha = heroes.some(h => h.name === 'ユズハ');
        const hasNorshu = heroes.some(h => h.name === 'ノルシュ');
        const hasNewRivvia = heroes.some(h => h.name === 'リヴィア（神秘）');
        const boostPerRound = data.psBurningBoostPerRound(hero.exclusiveLv, hasRivvia, hasYuzuha, hasNorshu, hasNewRivvia);
        const avgBoost = boostPerRound.reduce((sum, val, i) => 
          sum + val * powerRoundWeights[i], 0);
        globalBurningBoost += avgBoost;
      }
    });

    // グローバル衰弱効果強化（ノーラ専用5以上で+40%）
    let globalDebuffBoost = 0;
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (data && data.globalDebuffBoost) {
        globalDebuffBoost += data.globalDebuffBoost(hero.exclusiveLv);
      }
    });

    // グローバル脆弱効果強化（ノーラ専用5以上で+60%）
    let globalVulnerableBoost = 0;
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (data && data.globalVulnerableBoost) {
        globalVulnerableBoost += data.globalVulnerableBoost(hero.exclusiveLv);
      }
    });

    // グローバルASダメージ倍率（ノーラ専用7以上で適用）
    let noraASDamageMultiplier = 1.0;
    let noraSpecialMultiplier = 1.0;
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (data && data.globalASDamageMultiplier) {
        const mult = data.globalASDamageMultiplier(hero.exclusiveLv);
        if (mult > noraASDamageMultiplier) {
          noraASDamageMultiplier = mult;
        }
      }
      if (data && data.specialHeroesASDamageMultiplier) {
        const mult = data.specialHeroesASDamageMultiplier(hero.exclusiveLv);
        if (mult > noraSpecialMultiplier) {
          noraSpecialMultiplier = mult;
        }
      }
    });
    // specialHeroesを持つ全英雄のリストをマージ（ノーラ・アデルなど複数対応）
    const noraSpecialHeroes = [...new Set(
      heroes.flatMap(h => heroData[h.name]?.specialHeroes || [])
    )];

    // 被ダメージ減少シールドの種類数の計算
    
    // ── 重甲率の計算 ──
    // 各英雄の重甲率を取得し、最大値を合計重甲率とする
    let maxHeavyArmorRate = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data) return;
      if (data.heavyArmorRate !== undefined) {
        const rate = typeof data.heavyArmorRate === 'function'
          ? data.heavyArmorRate(hero.exclusiveLv)
          : data.heavyArmorRate;
        if (rate > maxHeavyArmorRate) maxHeavyArmorRate = rate;
      }
    });
    // 重甲率補填を持つ英雄が1人いるごとに合計重甲率を補填
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.heavyArmorRateComplement === undefined) return;
      const comp = typeof data.heavyArmorRateComplement === 'function'
        ? data.heavyArmorRateComplement(hero.exclusiveLv)
        : data.heavyArmorRateComplement;
      if (comp > 0) {
        maxHeavyArmorRate = maxHeavyArmorRate + (1 - maxHeavyArmorRate) * comp;
      }
    });
    const totalHeavyArmorRate = maxHeavyArmorRate;

    // ── 軽甲率の計算 ──
    // 各英雄の軽甲率を取得し、最大値を合計軽甲率とする
    let maxLightArmorRate = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data) return;
      if (data.lightArmorRate !== undefined) {
        const rate = typeof data.lightArmorRate === 'function'
          ? data.lightArmorRate(hero.exclusiveLv)
          : data.lightArmorRate;
        if (rate > maxLightArmorRate) maxLightArmorRate = rate;
      }
    });
    // 軽甲率補填を持つ英雄が1人いるごとに合計軽甲率を補填
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.lightArmorRateComplement === undefined) return;
      const comp = typeof data.lightArmorRateComplement === 'function'
        ? data.lightArmorRateComplement(hero.exclusiveLv)
        : data.lightArmorRateComplement;
      if (comp > 0) {
        maxLightArmorRate = maxLightArmorRate + (1 - maxLightArmorRate) * comp;
      }
    });
    const totalLightArmorRate = maxLightArmorRate;

    // ── 鉄壁率の計算（有効ラウンド分の重み×1） ──
    // 鉄壁を持つ英雄の最大ラウンド数を取得
    let ironWallMaxRoundsForShield = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (data && data.ironWallRounds) {
        const rounds = typeof data.ironWallRounds === 'function'
          ? data.ironWallRounds(hero.exclusiveLv)
          : data.ironWallRounds;
        if (rounds > ironWallMaxRoundsForShield) ironWallMaxRoundsForShield = rounds;
      }
    });
    if (ironWallMaxRoundsForShield > 0) {
      // 破壊不能チェック（タイタンON時のみ）
      let hasIndestructibleForShield = false;
      if (useTitan) {
        heroes.forEach((hero, i) => {
          titanEquip[i].forEach((equip, slotIdx) => {
            if (equip.effect === '破壊不能' && slotNames[slotIdx] === 'armor') {
              hasIndestructibleForShield = true;
            }
          });
        });
      }
      if (hasIndestructibleForShield) ironWallMaxRoundsForShield += 1;
    }
    // ── 覚醒スキル効果の集計（英雄ごと） ──
    // heroData.js の awakening オブジェクトは、各プロパティが既に計算済みの最終値
    // （またはreactivationのような小さな記述）を返す。エンジン側はプロパティ名ごとに
    // 「存在すれば対応する場所に加算する」だけの単純な参照処理しか持たない。
    //
    // 覚醒OFF（awakeningEnabled=false）の場合は、全英雄について
    // 「覚醒実装前の状態＝全スキルランク0」と同じ扱い（=nullで集計スキップ）にする。
    // スライダーの値自体は保持されたまま、計算にのみ反映されない。
    //
    // 「鉄壁が有効なラウンド」は上で算出した ironWallMaxRoundsForShield を使う。
    // これは useTitan が true の時だけ破壊不能の+1ラウンドを含むので、
    // タイタンの着脱がそのまま反映される。
    const reactivationConditionMask = {
      ironWallActive: [0, 1, 2, 3].map(r => r < ironWallMaxRoundsForShield),
      always: [true, true, true, true]
    };
    // 同時編成の存在確認。メインループ内（PS燃焼・挑発・AS付随燃焼など）で使うため、
    // 使用箇所より前に宣言しておく必要がある（後ろに置くと「初期化前に参照」エラーになる）。
    const hasMisty = heroes.some(h => h.name === 'ミスティ');
    const hasAsuka = heroes.some(h => h.name === 'アスカ');
    const hasYuzuha = heroes.some(h => h.name === 'ユズハ');
    const hasNorshu = heroes.some(h => h.name === 'ノルシュ');

    const awakeningEffects = heroes.map((hero, i) => {
      if (!awakeningEnabled) return null;
      const data = heroData[hero.name];
      if (!data || !data.awakening) return null;
      const ranks = awakening[i] || {};
      const exLv = hero.exclusiveLv;
      const aw = data.awakening;

      // 単純な数値・配列はheroData側の関数をそのまま呼ぶだけ（型判定は不要）
      // ※ shieldBonus / asDamageBonus は resolveShieldBuff / resolveAsDamage 経由で
      //   各呼び出し箇所に自動的に伝播するため、ここでは集計しない。
      const attachedMagnetics = aw.attachedMagnetics ? (aw.attachedMagnetics(ranks, exLv) || []) : [];
      const passiveMagneticDamageBonus = aw.passiveMagneticDamageBonus ? (aw.passiveMagneticDamageBonus(ranks, exLv) || 0) : 0;
      const globalMagneticBoostBonus = aw.globalMagneticBoost ? (aw.globalMagneticBoost(ranks, exLv) || 0) : 0;
      const magneticBurningReductionBonus = aw.magneticBurningReduction ? (aw.magneticBurningReduction(ranks, exLv) || 0) : 0;

      // reactivationだけは複数フィールドを持つ記述が必要（鉄壁ラウンド判定・確率補正はエンジン側の役割）
      const reactivationEntries = [];
      if (aw.reactivation) {
        const effect = aw.reactivation(ranks, exLv);
        if (effect) {
          const mask = reactivationConditionMask[effect.condition] || reactivationConditionMask.always;
          const conditionWeight = powerRoundWeights.reduce((sum, w, r) => sum + (mask[r] ? w : 0), 0);
          reactivationEntries.push({
            reactivateAsEffects: effect.reactivateAsEffects !== false,
            damageRatio: effect.damageRatio || 0,
            factor: conditionWeight * ((effect.triggerRate || 0) / 100)
          });
        }
      }

      return {
        globalMagneticBoostFlat: globalMagneticBoostBonus,
        magneticBurningReductionSum: magneticBurningReductionBonus,
        passiveMagneticDamageFlatSum: passiveMagneticDamageBonus,
        attachedMagnetics,
        reactivationEntries
      };
    });

    // AS発動率 → トリガー確率（再発動込み）への変換
    // 「トリガー確率 = AS発動率 × (1 + 条件重み和×再発動確率の合計)」
    // reactivateAsEffects=false の再発動は付随効果を再発動しないため、この合計には含めない。
    const applyReactivationToRate = (heroIndex, baseAsRate) => {
      const agg = awakeningEffects[heroIndex];
      if (!agg) return baseAsRate;
      const totalFactor = agg.reactivationEntries
        .filter(e => e.reactivateAsEffects)
        .reduce((sum, e) => sum + e.factor, 0);
      return baseAsRate * (1 + totalFactor);
    };

    // 覚醒スキルによるグローバル磁気効果強化の加算
    globalMagneticBoost += awakeningEffects.reduce((sum, agg) => sum + (agg ? agg.globalMagneticBoostFlat : 0), 0);

    // 覚醒スキルによる「磁気燃焼ダメージ軽減」の合計（全英雄分の和）
    // ── 衰弱等耐久補正の計算で使用（下記参照）
    const totalMagneticBurningReduction = awakeningEffects.reduce((sum, agg) => sum + (agg ? agg.magneticBurningReductionSum : 0), 0);

    // 鉄壁率 = 有効ラウンドの重み×1 の合計
    let ironWallRate = 0;
    for (let i = 0; i < ironWallMaxRoundsForShield && i < 4; i++) {
      ironWallRate += powerRoundWeights[i] * 1;
    }

    // ── シールド種類数 = 合計重甲率 + 合計軽甲率 + 鉄壁率 ──
    const averageShieldTypes = totalHeavyArmorRate + totalLightArmorRate + ironWallRate;

    const hasRachel = heroes.some(h => h.name === 'レイチェル');
    const rachelTier = heroes.find(h => h.name === 'レイチェル')?.exclusiveLv || -1;

    // 後続コードとの互換性のために shieldTypesPerRound を作成
    // （鉄壁は各ラウンドごとに1加算、重甲率・軽甲率は全ラウンド共通）
    // レイチェル専7の+0.12は重甲率補填として averageShieldTypes に反映済み
    const shieldTypesPerRound = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      shieldTypesPerRound[i] = totalHeavyArmorRate + totalLightArmorRate;
      if (i < ironWallMaxRoundsForShield) shieldTypesPerRound[i] += 1;
    }

    // 互換変数（旧コードで参照されている変数）
    const marinaTier = heroes.find(h => h.name === 'マリナ')?.exclusiveLv || -1;

    // 拡散ダメ加算の集計（レイチェル・マリナ・コレット・ルーシィから）
    let totalScatterDamageBoost = 0;
    let scatterBulletBonus = 0; // 拡散弾数ボーナス（レイチェル・マリナ）
    
    // ダメ減加算の集計（レイチェル・マリナ・コレット・ルーシィから）
    let totalDamageReductionAddition = 0;
    
    // レイチェル・マリナのPS収束によるダメ増加算
    let shieldTypesDamageIncrease = 0;
    
    // レイチェルの重甲倍率
    let rachelArmorMultiplier = 1.0;
    
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      const exLv = hero.exclusiveLv;
      
      // レイチェル
      if (hero.name === 'レイチェル') {
        if (data.scatterDamageBoost) {
          totalScatterDamageBoost += data.scatterDamageBoost(exLv);
        }
        if (data.scatterBulletBonus) {
          scatterBulletBonus = Math.max(scatterBulletBonus, data.scatterBulletBonus);
        }
        if (data.damageReductionAddition) {
          totalDamageReductionAddition += data.damageReductionAddition;
        }
        if (data.shieldTypesDamageBoost) {
          shieldTypesDamageIncrease += averageShieldTypes * data.shieldTypesDamageBoost(exLv);
        }
        if (data.armorMultiplier) {
          rachelArmorMultiplier = data.armorMultiplier(exLv);
        }
      }
      
      // マリナ
      if (hero.name === 'マリナ') {
        if (data.scatterDamageBoost) {
          totalScatterDamageBoost += data.scatterDamageBoost(exLv);
        }
        if (data.scatterBulletBonus) {
          const bonus = typeof data.scatterBulletBonus === 'function' ? data.scatterBulletBonus(exLv) : data.scatterBulletBonus;
          scatterBulletBonus = Math.max(scatterBulletBonus, bonus);
        }
        if (data.damageReductionAddition) {
          totalDamageReductionAddition += data.damageReductionAddition;
        }
        if (data.shieldTypesDamageBoost) {
          shieldTypesDamageIncrease += averageShieldTypes * data.shieldTypesDamageBoost(exLv);
        }
      }
      
      // コレット・ピスカ
      if (hero.name === 'コレット' || hero.name === 'ピスカ') {
        if (data.shieldTypesScatterBoost) {
          totalScatterDamageBoost += averageShieldTypes * data.shieldTypesScatterBoost(exLv);
        }
        if (data.shieldTypesDamageReductionBoost) {
          totalDamageReductionAddition += averageShieldTypes * data.shieldTypesDamageReductionBoost(exLv);
        }
      }
      
      // ルーシィ
      if (hero.name === 'ルーシィ') {
        if (data.shieldTypesScatterBoost) {
          totalScatterDamageBoost += averageShieldTypes * data.shieldTypesScatterBoost(exLv);
        }
        if (data.shieldTypesDamageReductionBoost) {
          totalDamageReductionAddition += averageShieldTypes * data.shieldTypesDamageReductionBoost(exLv);
        }
      }
    });

    // ミーチェのAS付随ダメ減（耐久重み係数で平均化）
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      const exLv = hero.exclusiveLv;
      
      if (hero.name === 'ミーチェ' && data.asDamageReduction) {
        // 全軍突撃の確認
        let hasRush = false;
        if (useTitan) {
          titanEquip[i].forEach((equip, slotIdx) => {
            if (equip.effect === '全軍突撃' && slotNames[slotIdx] === 'rifle') hasRush = true;
          });
        }
        
        const baseRate = typeof data.asRate === 'function' ? data.asRate(exLv) : data.asRate;
        const actualRate = baseRate * (9 - buffs.silenceCount) / 9 / 100;
        const reductionPerRound = data.asDamageReduction(exLv, actualRate, hasRush);
        
        // 耐久重み係数で平均化
        const avgReduction = reductionPerRound.reduce((sum, val, i) => 
          sum + val * 100 * durabilityRoundWeights[i], 0);
        totalDamageReductionAddition += avgReduction;
      }
    });


    // ローカル磁気効果強化（装備した英雄のみに適用）
    const localMagneticBoosts = heroes.map((hero, i) => {
      let boost = 0;
      if (useTitan) {
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '着磁' && ['armor', 'head', 'boots'].includes(slotNames[slotIdx])) {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '着磁');
            if (effect && effect.levels && effect.levels[equip.level - 1] !== undefined) {
              boost += effect.levels[equip.level - 1];
            }
          }
        });
      }
      return boost;
    });

    // ローカル燃焼効果強化（装備した英雄のみに適用）
    const localBurningBoosts = heroes.map((hero, i) => {
      let boost = 0;
      if (useTitan) {
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '点火' && ['armor', 'head', 'boots'].includes(slotNames[slotIdx])) {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '点火');
            if (effect && effect.levels && effect.levels[equip.level - 1] !== undefined) {
              boost += effect.levels[equip.level - 1];
            }
          }
        });
      }
      return boost;
    });

    // ローカル衰弱効果強化（装備した英雄のみに適用）
    const localWeakenBoosts = heroes.map((hero, i) => {
      let boost = 0;
      if (useTitan) {
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '振動' && ['armor', 'head', 'boots'].includes(slotNames[slotIdx])) {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '振動');
            if (effect && effect.levels && effect.levels[equip.level - 1] !== undefined) {
              boost += effect.levels[equip.level - 1];
            }
          }
        });
      }
      return boost;
    });

    // ローカル脆弱効果強化（装備した英雄のみに適用）
    const localVulnerBoosts = heroes.map((hero, i) => {
      let boost = 0;
      if (useTitan) {
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '重撃' && ['armor', 'head', 'boots'].includes(slotNames[slotIdx])) {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '重撃');
            if (effect && effect.levels && effect.levels[equip.level - 1] !== undefined) {
              boost += effect.levels[equip.level - 1];
            }
          }
        });
      }
      return boost;
    });

    // 戦場洞察と補足不能の合計値を計算
    if (useTitan) {
      heroes.forEach((hero, i) => {
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '戦場洞察') {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '戦場洞察');
            if (effect && effect.levels && effect.levels[equip.level - 1] !== undefined) {
              totalInsightValue += effect.levels[equip.level - 1];
            }
          }
          if (equip.effect === '補足不能') {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '補足不能');
            if (effect && effect.levels && effect.levels[equip.level - 1] !== undefined) {
              totalElusivenessValue += effect.levels[equip.level - 1];
            }
          }
        });
      });
    }

    let runeMagneticBonus = 0;
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (hero.name === 'ルネ' && data && data.magneticBulletsBonus) {
        runeMagneticBonus = data.magneticBulletsBonus(hero.exclusiveLv);
      }
    });

    const hasCombo = heroes.some(h => h.name === 'ペトラ' || h.name === 'フランカ') && heroes.some(h => h.name === 'ミヤ' || h.name === 'クラリス');

    // 磁気数期待値の集計（アカネのAS拡散ダメ計算用）
    let totalMagneticBulletsExpected = 0;
    const magneticHeroCount = heroes.filter(h => ['フェルム', 'アカネ', 'ペトラ', 'フランカ', 'アスカ'].includes(h.name)).length - 1; // 自分を除く
    
    // 脆弱数期待値の集計（アリア＆ティナのASボーナス計算用）
    let totalVulnerableBulletsExpected = 0;

    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;

      const exLv = hero.exclusiveLv;
      
      if (data.attackBuff) {
        const attackBoost = data.attackBuff(exLv);
        totalAttackBuff += attackBoost * (100 + artilleryBoosts[i]) / 100;
      }

      if (data.shieldBuff) {
        const shieldBoost = resolveShieldBuff(data, exLv, awakeningEnabled ? (awakening[i] || {}) : null);
        totalShieldBuff += shieldBoost * (100 + steelBoosts[i]) / 100;
      }

      // 開戦シールド（ミーチェ、クラリス、ピスカなど）
      if (data.openingShield) {
        const openingShieldValue = resolveOpeningShield(data, exLv, awakeningEnabled ? (awakening[i] || {}) : null);
        if (openingShieldValue > 0) {
          totalShieldBuff += openingShieldValue * (100 + steelBoosts[i]) / 100;
        }
      }

      if (data.ironWallValue) {
        hasIronWall = true;
        const ironValue = data.ironWallValue(exLv);
        if (ironValue > maxIronWall) {
          maxIronWall = ironValue;
          maxIronWallExLv = exLv;
        }
      }

      if (data.asRate && data.asDamage && data.asBullets) {
        // AS発動率の取得（アリア＆ティナは専用レベルに応じて変化）
        const baseRate = typeof data.asRate === 'function' ? data.asRate(exLv) : data.asRate;
        const actualRate = baseRate * (9 - buffs.silenceCount) / 9 / 100;
        const bullets = typeof data.asBullets === 'function' ? data.asBullets(exLv) : data.asBullets;
        
        // ソフィ・ヒヨリの異常特攻判定
        const hasAbnormalCombo = (hero.name === 'ソフィ' || hero.name === 'ヒヨリ') &&
          heroes.some(h => h.name === 'アイリス' || h.name === 'ミーク' || h.name === 'マゼリア');
        const damage = resolveAsDamage(data, exLv, awakeningEnabled ? (awakening[i] || {}) : null, hasAbnormalCombo);
        
        // ノーラのグローバルASダメージ倍率を適用（直接ダメージ部分のみ）
        let asDamageMultiplier = 1.0;
        if (noraSpecialHeroes.includes(hero.name)) {
          asDamageMultiplier = noraSpecialMultiplier;
        } else {
          asDamageMultiplier = noraASDamageMultiplier;
        }
        
        // アリア＆ティナの脆弱ボーナス計算
        let finalDamage = damage;
        if (hero.name === 'アリア＆ティナ' && data.asVulnerableBonus) {
          const vulnerableProb = totalDirectBullets > 0 ? totalVulnerableBulletsExpected / totalDirectBullets : 0;
          const normalDamage = damage;
          const bonusDamage = data.asVulnerableBonus;
          finalDamage = normalDamage * (1 - vulnerableProb) + bonusDamage * vulnerableProb;
        }
        
        const asDamageAmount = actualRate * finalDamage * bullets * asDamageMultiplier;
        totalASDamage += asDamageAmount;
        ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'direct', origin: 'hero', source: 'AS本体', value: asDamageAmount });
        
        // 直接ダメージとして追跡
        totalDirectDamage += asDamageAmount;
        totalDirectBullets += actualRate * bullets;
        
        // AS直接ダメージとして追跡（追撃火力比率計算用）
        totalASDirectDamage += asDamageAmount;
        totalASDirectBullets += actualRate * bullets;
        
        totalASBullets += actualRate * bullets;

        // AS付随燃焼（ルチル・ノルシュ・ミスティ）
        if (data.asBurning) {
          const burningBoost = 100 + globalBurningBoost + localBurningBoosts[i];
          // 関数形式の場合はhasYuzuha, hasNorshuを渡す
          const burningInfo = typeof data.asBurning === 'function' 
            ? data.asBurning(hasYuzuha, hasNorshu) 
            : data.asBurning;
          const asBurningDamage = (actualRate * burningInfo.value * burningInfo.count * burningBoost / 100) / abnormalReductionDivisor;
          totalASDamage += asBurningDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'burning', origin: 'hero', source: 'AS付随燃焼', value: asBurningDamage });
          totalBurningDamage += asBurningDamage;
        }

        if ((hero.name === 'ペトラ' || hero.name === 'フランカ') && data.asExtraEffect) {
          const extra = data.asExtraEffect(exLv, hasCombo);
          if (extra) {
            // ルネボーナスを適用した弾数係数
            const bulletCoefficient = 1.5 + runeMagneticBonus;
            // AS弾数は英雄ごとに異なる判定
            const asBulletsCount = hero.name === 'フランカ' 
              ? (exLv >= 7 ? 5 : 4) 
              : (exLv >= 5 ? 5 : 4);
            const adjustedBullets = asBulletsCount * 0.5 * bulletCoefficient;
            const magneticBoost = 100 + globalMagneticBoost + localMagneticBoosts[i];
            const extraDamage = (actualRate * extra.damage * adjustedBullets * magneticBoost / 100) / abnormalReductionDivisor;
            totalASDamage += extraDamage;
            ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'magnetic', origin: 'hero', source: 'AS追加磁気', value: extraDamage });
            totalMagneticDamage += extraDamage;
            // ペトラの追加磁気は磁気属性なので直接ダメージには含めない
            
            // ペトラの磁気数を集計
            totalMagneticBulletsExpected += actualRate * adjustedBullets;
          }
        }
        
        // アカネの追加AS直接ダメージ（拡散ダメージではない）
        // 絶対値ダメージ（ASダメージ基準ではない）なので、ノーラ等のASダメージ倍率は適用しない
        if (hero.name === 'アカネ' && data.asScatterDamage) {
          const baseRate = typeof data.asRate === 'function' ? data.asRate(exLv) : data.asRate;
          const actualRate = baseRate * (9 - buffs.silenceCount) / 9 / 100;
          const scatterInfo = data.asScatterDamage(exLv, totalMagneticBulletsExpected, magneticHeroCount);
          const scatterDamage = actualRate * scatterInfo.damage * scatterInfo.bullets;
          totalASDamage += scatterDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'direct', origin: 'hero', source: 'AS追加直接ダメージ', value: scatterDamage });
          totalDirectDamage += scatterDamage;
          totalDirectBullets += actualRate * scatterInfo.bullets;
          
          // AS直接ダメージとして追跡
          totalASDirectDamage += scatterDamage;
          totalASDirectBullets += actualRate * scatterInfo.bullets;
        }
        
        // コレット・ピスカ・ルーシィの拡散ダメージ
        if ((hero.name === 'コレット' || hero.name === 'ピスカ' || hero.name === 'ルーシィ') && data.scatterDamage) {
          const baseRate = typeof data.asRate === 'function' ? data.asRate(exLv) : data.asRate;
          const actualRate = baseRate * (9 - buffs.silenceCount) / 9 / 100;
          
          // AS弾数
          const asBullets = typeof data.asBullets === 'function' ? data.asBullets(exLv) : data.asBullets;
          
          // 拡散基礎ダメージ（絶対値：100%基準 × baseRatio。ASダメージの大小には依存しない）
          const baseScatterRatio = data.scatterDamage.baseRatio;
          const scatterDamageBase = 100 * baseScatterRatio;
          
          // 拡散ダメ加算補正
          const scatterBoost = (100 + totalScatterDamageBoost) / 100;
          const scatterDamagePerBullet = scatterDamageBase * scatterBoost;
          
          // 拡散弾数（基礎弾数 + 拡散弾数ボーナス）
          let scatterBullets = data.scatterDamage.baseBullets + scatterBulletBonus;
          
          // コレット・ピスカ：種類数に応じた追加弾数
          if ((hero.name === 'コレット' || hero.name === 'ピスカ') && data.scatterDamage.conditionalBullets) {
            // 各ラウンドで追加弾数を計算して火力重みで平均
            const conditionalBulletsPerRound = shieldTypesPerRound.map(types => 
              data.scatterDamage.conditionalBullets(exLv, types));
            const avgConditionalBullets = conditionalBulletsPerRound.reduce((sum, val, i) => 
              sum + val * powerRoundWeights[i], 0);
            scatterBullets += avgConditionalBullets;
          }
          
          // 拡散ダメージ = AS発動率 × 拡散ダメージ/弾 × AS弾数 × 拡散弾数
          const totalScatterDamage = actualRate * scatterDamagePerBullet * asBullets * scatterBullets;
          totalASDamage += totalScatterDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'direct', origin: 'hero', source: '拡散ダメージ', value: totalScatterDamage });
          // 拡散ダメージも直接ダメージに含める
          totalDirectDamage += totalScatterDamage;
          totalDirectBullets += actualRate * asBullets * scatterBullets;
          
          // AS直接ダメージとして追跡
          totalASDirectDamage += totalScatterDamage;
          totalASDirectBullets += actualRate * asBullets * scatterBullets;
        }
      }
      
      // アカネ・フェルムのPS磁気
      if (data.psMagnetic) {
        const psInfo = data.psMagnetic(exLv);
        if (psInfo) {
          const magneticBoost = 100 + globalMagneticBoost + localMagneticBoosts[i];
          const psMagneticDamage = (psInfo.rate * psInfo.value * psInfo.count * magneticBoost / 100) / abnormalReductionDivisor;
          totalASDamage += psMagneticDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'magnetic', origin: 'hero', source: 'PS磁気', value: psMagneticDamage });
          totalMagneticDamage += psMagneticDamage;
          // 磁気数を集計
          totalMagneticBulletsExpected += psInfo.rate * psInfo.count;
        }
      }

      // 開幕燃焼（リヴィア・ユズハ・ストームシャドー）
      if (data.openingBurning) {
        // 関数形式またはオブジェクト形式に対応
        const openInfo = typeof data.openingBurning === 'function' 
          ? data.openingBurning(exLv) 
          : data.openingBurning;
        if (openInfo) {
          const burningBoost = 100 + globalBurningBoost + localBurningBoosts[i];
          const openingBurningDamage = (openInfo.rate * openInfo.value * openInfo.count * burningBoost / 100) / abnormalReductionDivisor;
          totalPSDamage += openingBurningDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'PS', kind: 'burning', origin: 'hero', source: '開幕燃焼', value: openingBurningDamage });
          totalBurningDamage += openingBurningDamage;
        }
      }

      // リヴィア・アスカのPS燃焼
      if (data.psBurning) {
        const psInfo = data.psBurning(exLv, buffs.speedCondition, hasMisty, hasAsuka);
        if (psInfo) {
          const burningBoost = 100 + globalBurningBoost + localBurningBoosts[i];
          const psBurningDamage = (psInfo.rate * psInfo.value * psInfo.count * burningBoost / 100) / abnormalReductionDivisor;
          totalPSDamage += psBurningDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'PS', kind: 'burning', origin: 'hero', source: 'PS燃焼', value: psBurningDamage });
          totalBurningDamage += psBurningDamage;
        }
      }

      // ユズハの挑発燃焼（R1とR2のみ）
      if (hero.name === 'ユズハ' && data.taunt) {
        const tauntInfo = data.taunt(exLv, buffs.speedCondition, hasMisty, hasAsuka);
        if (tauntInfo) {
          // R1とR2の重み係数で補正
          const tauntWeight = powerRoundWeights[0] + powerRoundWeights[1];
          const burningBoost = 100 + globalBurningBoost + localBurningBoosts[i];
          const tauntBurningDamage = (tauntInfo.rate * tauntInfo.burningValue * tauntInfo.burningCount * 
                                     burningBoost / 100 * tauntWeight) / abnormalReductionDivisor;
          totalPSDamage += tauntBurningDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'PS', kind: 'burning', origin: 'hero', source: '挑発燃焼', value: tauntBurningDamage });
          totalBurningDamage += tauntBurningDamage;
        }
      }

      if (data.psMagneticDamage && data.psMagneticBullets) {
        const bullets = typeof data.psMagneticBullets === 'function' ? 
          data.psMagneticBullets(exLv) + runeMagneticBonus : 
          data.psMagneticBullets + runeMagneticBonus;
        const damage = typeof data.psMagneticDamage === 'function' ?
          data.psMagneticDamage(exLv) :
          data.psMagneticDamage;
        const magneticBoost = 100 + globalMagneticBoost + localMagneticBoosts[i];
        const miyaMagneticDamage = (damage * bullets * magneticBoost / 100) / abnormalReductionDivisor;
        totalPSDamage += miyaMagneticDamage;
        ledgerAdd({ hero: hero.name, idx: i, phase: 'PS', kind: 'magnetic', origin: 'hero', source: 'PS磁気', value: miyaMagneticDamage });
        totalMagneticDamage += miyaMagneticDamage;
        // ミヤの磁気数を集計
        totalMagneticBulletsExpected += bullets;
      }
    });

    // 磁場（磁気付与）などの付与系効果は追撃総ダメージに計上（ASトリガー）
    // 衰弱効果の収集（耐久計算用）
    const debuffEffects = [];
    
    if (useTitan) {
      heroes.forEach((hero, i) => {
        const data = heroData[hero.name];
        if (!data || data.name === '未実装' || data.name === '外す') return;

        let asRate = 0;
        if (data.asRate) {
          const rawAsRate = typeof data.asRate === 'function' ? data.asRate(hero.exclusiveLv) : data.asRate;
          asRate = rawAsRate * (9 - buffs.silenceCount) / 9 / 100;
        }
        // 覚醒スキルの再発動があれば、AS発動率の代わりに「トリガー確率」を補正対象にする
        const triggerAsRate = applyReactivationToRate(i, asRate);

        // 全軍突撃の有無を確認
        let hasRush = false;
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '全軍突撃' && slotNames[slotIdx] === 'rifle') {
            hasRush = true;
          }
        });

        // 衝撃（衰弱付与）効果を収集（タイタン装備）
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '衝撃' && ['rifle', 'vision', 'handy'].includes(slotNames[slotIdx])) {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '衝撃');
            if (effect && effect.levels && effect.counts) {
              const weakenValue = effect.levels[equip.level - 1];
              const weakenCount = effect.counts[equip.level - 1];
              const weakenBoost = 100 + localWeakenBoosts[i] + globalDebuffBoost;
              const debuffRate = getDebuffRate(triggerAsRate, weakenCount, hasRush);
              const enhancedValue = weakenValue * weakenBoost / 100;
              debuffEffects.push({ value: enhancedValue, rate: debuffRate });
            }
          }
        });
      });
    }

    // 英雄固有の衰弱スキル（タイタンON/OFFに関わらず適用）
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;

      const exLv = hero.exclusiveLv;
      const baseRate = data.asRate ? (typeof data.asRate === 'function' ? data.asRate(exLv) : data.asRate) : 0;
      let asRate = baseRate * (9 - buffs.silenceCount) / 9 / 100;

      // 全軍突撃の有無を確認（タイタンON時のみ）
      let hasRush = false;
      if (useTitan) {
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '全軍突撃' && slotNames[slotIdx] === 'rifle') hasRush = true;
        });
      }

      // ノーラ・アデルのPS衰弱付与
      if ((hero.name === 'ノーラ' || hero.name === 'アデル') && data.psDebuffValue) {
        const debuffRate = data.psDebuffRate(exLv) / 100;
        const enhancedValue = data.psDebuffValue * (100 + localWeakenBoosts[i] + globalDebuffBoost) / 100;
        debuffEffects.push({ value: enhancedValue, rate: debuffRate });
      }

      // ツバキのPS衰弱付与
      if (hero.name === 'ツバキ' && data.psDebuffValue) {
        const debuffRate = data.psDebuffRate(exLv) / 100;
        const enhancedValue = data.psDebuffValue * (100 + localWeakenBoosts[i] + globalDebuffBoost) / 100;
        debuffEffects.push({ value: enhancedValue, rate: debuffRate });
      }

      // ミーク・アイリス・デュークのAS衰弱付与
      if ((hero.name === 'ミーク' || hero.name === 'マゼリア' || hero.name === 'アイリス' || hero.name === 'デューク' || hero.name === 'デスコ') && data.asDebuff) {
        const debuffInfo = typeof data.asDebuff === 'function' 
          ? data.asDebuff(exLv, hasRush, buffs.silenceCount)
          : data.asDebuff;
        const enhancedValue = debuffInfo.value * (100 + localWeakenBoosts[i] + globalDebuffBoost) / 100;
        debuffEffects.push({ value: enhancedValue, rate: debuffInfo.rate });
      }
    });

    // 衰弱耐久補正の計算（二項分布的な重複処理）
    let debuffDurabilityCorrection = 1.0;
    
    if (debuffEffects.length > 0) {
      // E[F] = Σ (∏(i∈S) Pi ∏(j∉S) (1-Pj) · 1/(1 + Σ(k∈S) Dk))
      // すべての組み合わせ（2^n通り）を計算
      const n = debuffEffects.length;
      let expectedEnemyPower = 0;
      
      for (let mask = 0; mask < (1 << n); mask++) {
        let probability = 1.0;
        let totalDebuffValue = 0;
        
        for (let i = 0; i < n; i++) {
          if (mask & (1 << i)) {
            // この衰弱が適用される
            probability *= debuffEffects[i].rate;
            totalDebuffValue += debuffEffects[i].value;
          } else {
            // この衰弱が適用されない
            probability *= (1 - debuffEffects[i].rate);
          }
        }
        
        // この組み合わせでの敵火力
        const enemyPowerMultiplier = 1 / (1 + totalDebuffValue / 100);
        expectedEnemyPower += probability * enemyPowerMultiplier;
      }
      
      // 衰弱耐久補正 = 1 / E[F]
      debuffDurabilityCorrection = 1 / expectedEnemyPower;
    }

    // 重甲耐久補正の計算
    // 合算重甲効果 = 各英雄ごとに (重甲値/100) × 枚数 × 0.6 を計算して合算
    // armorDurabilityCorrection = 1 + 敵追撃期待値 × 合算重甲効果
    let armorDurabilityCorrection = 1.0;
    const enemyRushExpected = buffs.enemyRushRatio;
    let totalArmorEffect = 0;

    // タイタン装備の重甲（英雄ごとに計算）
    if (useTitan) {
      heroes.forEach((hero, i) => {
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '重甲' && slotNames[slotIdx] === 'armor') {
            const effect = titanEffects['armor'].effects.find(e => e.name === '重甲');
            if (effect && effect.levels && effect.counts) {
              const val = effect.levels[equip.level - 1];
              const cnt = effect.counts[equip.level - 1];
              totalArmorEffect += (val / 100) * cnt * 0.6;
            }
          }
        });
      });
    }

    // ミーク・アイリスのAS重甲、レイチェル・マリナのPS重甲（英雄ごとに計算）
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      const exLv = hero.exclusiveLv;

      // AS重甲（ミーク・アイリス）：期待枚数 = 発動率 × 付与数
      if (data.asArmor) {
        const actualRate = data.asRate ? data.asRate * (9 - buffs.silenceCount) / 9 / 100 : 0;
        const expectedCount = actualRate * data.asArmor.count;
        totalArmorEffect += (data.asArmor.value / 100) * expectedCount * 0.6;
      }

      // PS重甲（レイチェル：固定オブジェクト、マリナ：関数）
      if (data.psArmor) {
        const psArmor = typeof data.psArmor === 'function' ? data.psArmor(exLv) : data.psArmor;
        let count = psArmor.count;
        // レイチェル専7の重甲倍率を適用
        if (rachelArmorMultiplier > 1.0 && hero.name === 'レイチェル') {
          count *= rachelArmorMultiplier;
        }
        totalArmorEffect += (psArmor.value / 100) * count * 0.6;
      }
    });

    if (totalArmorEffect > 0) {
      armorDurabilityCorrection = 1 + enemyRushExpected * totalArmorEffect;
    }
    
    // 耐性・復讐効果の計算
    let revengeDirectDamage = 0;
    let revengeDamageReduction = 0;  // 復讐ダメ減（英雄基礎耐久に加算）
    let maxRevengeData = null;
    let maxRevengeHero = null;
    let maxRevengeIdx = null;
    
    // 復讐データの収集（最大値のみ適用）
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      const exLv = hero.exclusiveLv;
      
      if (data.revenge) {
        const revengeData = typeof data.revenge === 'function' ? data.revenge(exLv) : data.revenge;
        if (!maxRevengeData || revengeData.damage > maxRevengeData.damage) {
          maxRevengeData = revengeData;
          maxRevengeHero = hero.name;
          maxRevengeIdx = i;
        }
      }
    });
    
    // 復讐ダメージ強化の集計（カトレア）
    let revengeBoost = 100;
    let revengeCountBonus = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      if (data.revengeBoost) {
        revengeBoost += data.revengeBoost(hero.exclusiveLv);
      }
      if (data.revengeCountBonus !== undefined) {
        // revengeCountBonusは数値
        revengeCountBonus += data.revengeCountBonus;
      }
    });
    
    // 復讐ダメ減と復讐ダメージの計算
    let revengeExpectedCount = 0;  // スコープを拡大
    if (maxRevengeData) {
      // 復讐個数：count × multiplier + bonus（ボーナスはmultiplierの外で加算）
      const totalRevengeCount = maxRevengeData.count * maxRevengeData.multiplier + revengeCountBonus;
      revengeExpectedCount = totalRevengeCount * 0.1111;  // 期待値個数
      
      // 復讐ダメ減：（復讐個数期待値 / 5.5） × 復讐ダメ減値
      revengeDamageReduction = (revengeExpectedCount / 5.5) * maxRevengeData.reductionRate;
      
      // 復讐ダメージ：直接ダメージ属性（期待値個数を使用、発動率は既に含まれている）
      revengeDirectDamage = maxRevengeData.damage * revengeExpectedCount * (revengeBoost / 100);
    }
    
    // 耐性個数の集計（R1耐久重みを適用）
    let totalResistanceCount = 0;
    const r1DurabilityWeight = durabilityRoundWeights[0];
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      const exLv = hero.exclusiveLv;
      
      if (data.resistance) {
        const resistance = typeof data.resistance === 'function' ? data.resistance(exLv) : data.resistance;
        if (resistance && resistance.round === 1) {
          // スネーク・シャーリーの耐性はR1耐久重み係数を適用
          totalResistanceCount += resistance.count * r1DurabilityWeight;
        }
      }
    });
    
    // 耐性効果：敵の直接ダメ比率 × 耐性個数（R1重み適用済み） × 0.1111
    let resistanceDurabilityBonus = 0;
    if (totalResistanceCount > 0) {
      resistanceDurabilityBonus = buffs.directDamageRatio * totalResistanceCount * 0.1111;
    }
    
    // 沈黙耐久係数の計算（ノーラ・ツバキの沈黙効果）
    let totalSilenceCount = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if (data.silenceCount) {
        const silenceCount = typeof data.silenceCount === 'function' 
          ? data.silenceCount(hero.exclusiveLv) 
          : data.silenceCount;
        totalSilenceCount = Math.max(totalSilenceCount, silenceCount);  // 最大値を採用
      }
    });
    
    // 沈黙耐久係数：1 / (敵AS依存率 × ((9-沈黙数)/9) + (1-敵AS依存率))
    let silenceDurabilityCorrection = 1.0;
    if (totalSilenceCount > 0) {
      const enemyASRatio = buffs.enemyASRatio || 0;
      const asReductionRatio = (9 - totalSilenceCount) / 9;
      const denominator = enemyASRatio * asReductionRatio + (1 - enemyASRatio);
      silenceDurabilityCorrection = 1 / denominator;
    }
    
    // 磁気燃焼ダメージ軽減による除数（ミヤの覚醒スキル2など）
    // { (1-敵の磁気燃焼依存率) + (敵の磁気燃焼依存率 / (1 + 全英雄の磁気燃焼ダメージ軽減の和/100)) }
    // 軽減が0（覚醒OFF・未解禁含む）の場合は分子が (1-r)+r=1 となり、補正なしと同じになる。
    const enemyMagneticBurningRatio = buffs.enemyMagneticBurningRatio || 0;
    const magneticBurningReductionDivisor = (1 - enemyMagneticBurningRatio) +
                                             (enemyMagneticBurningRatio / (1 + totalMagneticBurningReduction / 100));

    // 衰弱等耐久補正 = 衰弱耐久補正 × （1 + 重甲効果 + 耐性効果） × 沈黙耐久係数 ÷ 磁気燃焼ダメージ軽減除数
    const totalDebuffDurabilityCorrection = debuffDurabilityCorrection * 
                                             (armorDurabilityCorrection + resistanceDurabilityBonus) *
                                             silenceDurabilityCorrection /
                                             magneticBurningReductionDivisor;
    if (useTitan) {
      heroes.forEach((hero, i) => {
        const data = heroData[hero.name];
        if (!data || data.name === '未実装' || data.name === '外す') return;

        // 実際のAS発動率
        let asRate = 0;
        if (data.asRate) {
          const rawAsRate = typeof data.asRate === 'function' ? data.asRate(hero.exclusiveLv) : data.asRate;
          asRate = rawAsRate * (9 - buffs.silenceCount) / 9 / 100;
        }
        // タイタンのAS付随効果（磁場・灼熱・破凱）は100%効果のまま、
        // 覚醒スキルの再発動があればトリガー確率＝AS発動率×(1+条件重み和×再発動確率)で計算する。
        // これにより増分 = AS発動率 × 条件重み和 × 再発動確率 × 100%効果 となる。
        asRate = applyReactivationToRate(i, asRate);

        titanEquip[i].forEach((equip, slotIdx) => {
          // 磁場（磁気付与）
          if (equip.effect === '磁場' && ['rifle', 'vision', 'handy'].includes(slotNames[slotIdx])) {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '磁場');
            if (effect && effect.levels && effect.counts) {
              const magneticValue = effect.levels[equip.level - 1];
              const magneticCount = effect.counts[equip.level - 1];
              const magneticBoost = 100 + globalMagneticBoost + localMagneticBoosts[i];
              const titanMagneticDamage = (asRate * magneticValue * magneticCount * magneticBoost / 100) / abnormalReductionDivisor;
              totalASDamage += titanMagneticDamage;
              ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'magnetic', origin: 'titan', source: 'タイタン:磁場', value: titanMagneticDamage, slot: slotNames[slotIdx] });
              totalMagneticDamage += titanMagneticDamage;
              // 磁気数期待値を集計
              totalMagneticBulletsExpected += asRate * magneticCount;
            }
          }
          
          // 灼熱（燃焼付与）
          if (equip.effect === '灼熱' && ['rifle', 'vision', 'handy'].includes(slotNames[slotIdx])) {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '灼熱');
            if (effect && effect.levels && effect.counts) {
              const burningValue = effect.levels[equip.level - 1];
              const burningCount = effect.counts[equip.level - 1];
              const burningBoost = 100 + globalBurningBoost + localBurningBoosts[i];
              const titanBurningDamage = (asRate * burningValue * burningCount * burningBoost / 100) / abnormalReductionDivisor;
              totalASDamage += titanBurningDamage;
              ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'burning', origin: 'titan', source: 'タイタン:灼熱', value: titanBurningDamage, slot: slotNames[slotIdx] });
              totalBurningDamage += titanBurningDamage;
            }
          }

          // 破凱（脆弱付与）- 脆弱属性のダメージ
          if (equip.effect === '破凱' && ['rifle', 'vision', 'handy'].includes(slotNames[slotIdx])) {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '破凱');
            if (effect && effect.levels && effect.counts && effect.lossCoefs) {
              const vulnerValue = effect.levels[equip.level - 1];
              const vulnerCount = effect.counts[equip.level - 1];
              const lossCoef = effect.lossCoefs[equip.level - 1];
              const vulnerBoost = 100 + localVulnerBoosts[i] + globalVulnerableBoost;
              
              // 脆弱ダメージ = (脆弱を含まない直接攻撃火力 / 直接攻撃弾数) × (脆弱値 / 100%) × (付与数 × ロス係数) × 脆弱強化 / 攻撃強化補正
              // これはASトリガーなので実際AS発動率を掛ける
              const vulnerDamage = asRate * (totalDirectDamage / (totalDirectBullets || 1)) * 
                                  (vulnerValue / 100) * (vulnerCount * (lossCoef * 0.95)) * 
                                  (vulnerBoost / 100) / ((100 + totalAttackBuff) / 100);
              totalASDamage += vulnerDamage;
              ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'vulnerable', origin: 'titan', source: 'タイタン:破凱', value: vulnerDamage, slot: slotNames[slotIdx] });
              // AS属性の脆弱として別途追跡（弾数はカウントしない。AS直接ダメージ側には入れない＝二重計上防止）
              totalASVulnerableDamage += vulnerDamage;
              // 脆弱数期待値を集計
              totalVulnerableBulletsExpected += asRate * vulnerCount * lossCoef * 0.95;
            }
          }
        });
      });
    }

    // 英雄固有のPS脆弱ダメージ（タイタンON/OFFに関わらず適用）
    // 【計上ルール】PS脆弱（ノーラ・アデル／ソフィ・ヒヨリ／アリア＆ティナ）は
    //   ・パッシブダメージ(PS)集計に加算
    //   ・属性は直接ダメージ(totalDirectDamage)に計上（脆弱属性・AS直接ダメージ追跡には入れない）
    //   ・直接弾数(totalDirectBullets)にはカウントしない
    // ループ内で totalDirectDamage を随時増やすと、後続の脆弱計算（マゼリア・アリア＆ティナ）の
    // 「直接火力/弾数」基準が編成順に依存してしまうため、直接ダメージへの加算はループ後にまとめて行う。
    let psVulnerableDirectPending = 0;
    heroes.forEach((hero, i) => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      const exLv = hero.exclusiveLv;

      // ノーラ・アデルのPS脆弱付与（1ラウンドに1度、確率11.11%）
      if ((hero.name === 'ノーラ' || hero.name === 'アデル') && data.psVulnerableValue) {
        const vulnerValue = typeof data.psVulnerableValue === 'function' ? data.psVulnerableValue(exLv) : data.psVulnerableValue;
        const triggerRate = data.psVulnerableTriggerRate;
        const baseDamage = data.psVulnerableDamage(exLv);
        const vulnerBoost = 100 + localVulnerBoosts[i] + globalVulnerableBoost;
        const nolaPSVulnerDamage = baseDamage * (vulnerValue / 100) * (vulnerBoost / 100) * triggerRate / ((100 + totalAttackBuff) / 100);
        totalPSDamage += nolaPSVulnerDamage;
        psVulnerableDirectPending += nolaPSVulnerDamage;
        totalPSVulnerableDamage += nolaPSVulnerDamage;
        ledgerAdd({ hero: hero.name, idx: i, phase: 'PS', kind: 'direct', origin: 'hero', source: 'PS脆弱', value: nolaPSVulnerDamage });
      }

      // マゼリアのAS脆弱付与
      if (hero.name === 'マゼリア' && data.asVulnerable) {
        const baseRate = typeof data.asRate === 'function' ? data.asRate(exLv) : data.asRate;
        const actualRate = baseRate * (9 - buffs.silenceCount) / 9 / 100;
        const { value: vulnerValue, count: vulnerCount, lossCoef } = data.asVulnerable;
        const vulnerBoost = 100 + localVulnerBoosts[i] + globalVulnerableBoost;
        const vulnerDamage = actualRate * (totalDirectDamage / (totalDirectBullets || 1)) *
                             (vulnerValue / 100) * (vulnerCount * lossCoef * 0.95) *
                             (vulnerBoost / 100) / ((100 + totalAttackBuff) / 100);
        totalASDamage += vulnerDamage;
        ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'vulnerable', origin: 'hero', source: 'AS脆弱', value: vulnerDamage });
        // AS属性の脆弱として別途追跡（AS直接ダメージ側には入れない＝二重計上防止）
        totalASVulnerableDamage += vulnerDamage;
        totalVulnerableBulletsExpected += actualRate * vulnerCount * lossCoef * 0.95;
      }

      // ソフィ・ヒヨリのPS脆弱ダメージ（毎ターン、期待値計算済み）
      if ((hero.name === 'ソフィ' || hero.name === 'ヒヨリ') && data.psVulnerable) {
        const psInfo = data.psVulnerable(exLv);
        const vulnerBoost = 100 + localVulnerBoosts[i] + globalVulnerableBoost;
        const psvulnerDamage = psInfo.count * psInfo.damage * (vulnerBoost / 100) / ((100 + totalAttackBuff) / 100);
        totalPSDamage += psvulnerDamage;
        psVulnerableDirectPending += psvulnerDamage;
        totalPSVulnerableDamage += psvulnerDamage;
        ledgerAdd({ hero: hero.name, idx: i, phase: 'PS', kind: 'direct', origin: 'hero', source: 'PS脆弱', value: psvulnerDamage });
      }
      
      // アリア＆ティナのPS脆弱（専5以上で1ラウンドに1度）
      if (hero.name === 'アリア＆ティナ' && data.psVulnerable) {
        const psInfo = data.psVulnerable(exLv);
        if (psInfo) {
          const vulnerBoost = 100 + localVulnerBoosts[i] + globalVulnerableBoost;
          // 脆弱ダメージ = (直接攻撃火力 / 直接攻撃弾数) × (脆弱値 / 100%) × 付与数 × 発動率 × 脆弱強化 / 攻撃強化補正
          const ariaPSVulnerDamage = psInfo.rate * (totalDirectDamage / (totalDirectBullets || 1)) *
                                     (psInfo.value / 100) * psInfo.count * (vulnerBoost / 100) / ((100 + totalAttackBuff) / 100);
          totalPSDamage += ariaPSVulnerDamage;
          psVulnerableDirectPending += ariaPSVulnerDamage;
          totalPSVulnerableDamage += ariaPSVulnerDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'PS', kind: 'direct', origin: 'hero', source: 'PS脆弱', value: ariaPSVulnerDamage });
          // 脆弱数期待値を集計
          totalVulnerableBulletsExpected += psInfo.rate * psInfo.count;
        }
      }
    });
    // PS脆弱分を直接ダメージ属性として計上（直接弾数は増やさない）
    totalDirectDamage += psVulnerableDirectPending;

    // 復讐ダメージをパッシブダメージと直接ダメージに追加
    let revengeBulletCount = 0;
    if (revengeDirectDamage > 0 && maxRevengeData) {
      totalPSDamage += revengeDirectDamage;
      ledgerAdd({ hero: maxRevengeHero, idx: maxRevengeIdx, phase: 'PS', kind: 'direct', origin: 'hero', source: '復讐', value: revengeDirectDamage });
      totalDirectDamage += revengeDirectDamage;
      // 復讐ダメージの弾数（期待値個数、1個あたり1発）
      revengeBulletCount = revengeExpectedCount;
      totalDirectBullets += revengeBulletCount;
    }

    // 連撃システムの計算
    // 1. 通常攻撃強化の集計（個別効果）
    let totalBasicAttackBoost = 100;  // 基準値100%
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if (data.basicAttackBoost) {
        const boost = typeof data.basicAttackBoost === 'function' 
          ? data.basicAttackBoost(hero.exclusiveLv) 
          : data.basicAttackBoost;
        totalBasicAttackBoost += boost;
      }
    });

    // 2. 連撃ダメ強化の集計（グローバル効果）
    let totalComboBoost = 100;  // 基準値100%
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if (data.comboBoost) {
        const boost = typeof data.comboBoost === 'function' 
          ? data.comboBoost(hero.exclusiveLv) 
          : data.comboBoost;
        totalComboBoost += boost;
      }
    });

    // 3. PS連撃の集計
    let totalComboExpectedCount = 0;  // 連撃回数期待値
    const comboContributors = [];
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if (data.psCombo) {
        const combo = typeof data.psCombo === 'function' 
          ? data.psCombo(hero.exclusiveLv) 
          : data.psCombo;
        if (combo) {
          // 連撃回数期待値 = 発動率 × 連撃回数
          totalComboExpectedCount += combo.rate * combo.count;
          comboContributors.push({ name: hero.name, idx: heroes.indexOf(hero), w: combo.rate * combo.count });
        }
      }
    });

    // 4. 通常攻撃強化を適用（常に適用）- enhancedBasicAttackを外部スコープで定義
    let enhancedBasicAttack = basicAttackDamage;
    if (totalBasicAttackBoost > 100) {
      // 通常攻撃ダメージ = (既存通常攻撃 × 通常攻撃強化倍率)
      enhancedBasicAttack = basicAttackDamage * (totalBasicAttackBoost / 100);
      
      // 通常攻撃を強化された値に置き換え
      totalPSDamage = totalPSDamage - basicAttackDamage + enhancedBasicAttack;
      totalDirectDamage = totalDirectDamage - basicAttackDamage + enhancedBasicAttack;
      basicAttackEntry.value = enhancedBasicAttack;
    }

    // 5. 連撃ダメージの計算
    let totalComboDamage = 0;  // 鼓動の対象になる連撃ダメージ合計（外部スコープで保持）
    if (totalComboExpectedCount > 0) {
      // 連撃ダメージ = (既存通常攻撃 × 通常攻撃強化倍率) × 連撃ダメ強化 × 連撃回数期待値
      const comboDamage = enhancedBasicAttack * (totalComboBoost / 100) * totalComboExpectedCount;
      totalComboDamage = comboDamage;
      
      // 連撃弾数 = 通常攻撃弾数 × 連撃回数期待値
      const comboBullets = basicAttackBullets * totalComboExpectedCount;
      
      // パッシブダメージに加算
      totalPSDamage += comboDamage;
      comboContributors.forEach(c => {
        ledgerAdd({ hero: c.name, idx: c.idx, phase: 'PS', kind: 'direct', origin: 'hero', source: '連撃', value: comboDamage * c.w / totalComboExpectedCount });
      });
      
      // 直接ダメージに加算（連撃は直接ダメージ属性）
      totalDirectDamage += comboDamage;
      totalDirectBullets += comboBullets;
    }

    // シャーリーのPS追加ダメージ（復讐と同様：パッシブ＋直接ダメージ＋直接弾数に計上）
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      const exLv = hero.exclusiveLv;
      
      if ((hero.name === 'シャーリー' || hero.name === 'メル') && data.psAdditionalDamage) {
        const psInfo = data.psAdditionalDamage(exLv);
        const additionalDamage = psInfo.rate * psInfo.damage * psInfo.multiplier * psInfo.count;
        totalPSDamage += additionalDamage;
        ledgerAdd({ hero: hero.name, idx: heroes.indexOf(hero), phase: 'PS', kind: 'direct', origin: 'hero', source: 'PS追加ダメージ', value: additionalDamage });
        totalDirectDamage += additionalDamage;
        const bulletCount = psInfo.rate * psInfo.multiplier * psInfo.count;
        totalDirectBullets += bulletCount;
      }
    });

    // 全軍突撃の計算（R1重み適用）
    let rushBonus = 0;
    let rushMagneticBonus = 0;
    let rushBurningBonus = 0;
    const rushParts = [];
    const rushAdd = (hero, idx, bucket, kind, source, raw, slot = null) => rushParts.push({ hero: hero.name, idx, bucket, kind, source, raw, slot });
    if (useTitan) {
      heroes.forEach((hero, i) => {
        const data = heroData[hero.name];
        if (!data || data.name === '未実装' || data.name === '外す') return;

        // 全軍突撃装備の検出
        let hasRush = false;
        let rushValue = 0;
        titanEquip[i].forEach((equip, slotIdx) => {
          if (equip.effect === '全軍突撃' && slotNames[slotIdx] === 'rifle') {
            const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '全軍突撃');
            if (effect && effect.levels) {
              hasRush = true;
              rushValue = effect.levels[equip.level - 1];
            }
          }
        });

        if (hasRush && data.asRate) {
          const exLv = hero.exclusiveLv;
          const baseRate = typeof data.asRate === 'function' ? data.asRate(exLv) : data.asRate;
          const actualRate = baseRate * (9 - buffs.silenceCount) / 9 / 100;
          
          // AS直接ダメージの全突分
          if (data.asDamage && data.asBullets) {
            const bullets = typeof data.asBullets === 'function' ? data.asBullets(exLv) : data.asBullets;
            const damage = resolveAsDamage(data, exLv, awakeningEnabled ? (awakening[i] || {}) : null);
            const rushPartAs = actualRate * damage * bullets * (rushValue / 100);
            rushBonus += rushPartAs;
            rushAdd(hero, i, 'plain', 'direct', '全軍突撃:AS本体', rushPartAs);
          }

          // ペトラのAS追加磁気の全突分（磁気属性だが全突対象）
          if ((hero.name === 'ペトラ' || hero.name === 'フランカ') && data.asExtraEffect) {
            const extra = data.asExtraEffect(exLv, hasCombo);
            if (extra) {
              const bulletCoefficient = 1.5 + runeMagneticBonus;
              // AS弾数は英雄ごとに異なる判定
              const asBulletsCount = hero.name === 'フランカ' 
                ? (exLv >= 7 ? 5 : 4) 
                : (exLv >= 5 ? 5 : 4);
              const adjustedBullets = asBulletsCount * 0.5 * bulletCoefficient;
              const magneticBoost = 100 + globalMagneticBoost + localMagneticBoosts[i];
              const rushPartExtra = actualRate * extra.damage * adjustedBullets * magneticBoost / 100 * (rushValue / 100);
              rushMagneticBonus += rushPartExtra;
              rushAdd(hero, i, 'abnormal', 'magnetic', '全軍突撃:AS追加磁気', rushPartExtra);
            }
          }

          // アカネのAS追加直接ダメージの全突分（拡散ダメージではないため、レイチェル等の拡散補正は適用しない）
          if (hero.name === 'アカネ' && data.asScatterDamage) {
            const scatterInfo = data.asScatterDamage(exLv, totalMagneticBulletsExpected, magneticHeroCount);
            const rushPartAkane = actualRate * scatterInfo.damage * scatterInfo.bullets * (rushValue / 100);
            rushBonus += rushPartAkane;
            rushAdd(hero, i, 'plain', 'direct', '全軍突撃:AS追加直接ダメージ', rushPartAkane);
          }

          // コレット・ピスカ・ルーシィの拡散ダメージの全突分
          if ((hero.name === 'コレット' || hero.name === 'ピスカ' || hero.name === 'ルーシィ') && data.scatterDamage) {
            const asBullets = typeof data.asBullets === 'function' ? data.asBullets(exLv) : data.asBullets;
            
            // 拡散基礎ダメージ（絶対値：100%基準 × baseRatio。ASダメージの大小には依存しない）
            const baseScatterRatio = data.scatterDamage.baseRatio;
            const scatterDamageBase = 100 * baseScatterRatio;
            
            // 拡散ダメ加算補正
            const scatterBoost = (100 + totalScatterDamageBoost) / 100;
            const scatterDamagePerBullet = scatterDamageBase * scatterBoost;
            
            // 拡散弾数（基礎弾数 + 拡散弾数ボーナス）
            let scatterBullets = data.scatterDamage.baseBullets + scatterBulletBonus;
            
            // コレット・ピスカ：種類数に応じた追加弾数
            if ((hero.name === 'コレット' || hero.name === 'ピスカ') && data.scatterDamage.conditionalBullets) {
              // 各ラウンドで追加弾数を計算して火力重みで平均
              const conditionalBulletsPerRound = shieldTypesPerRound.map(types => 
                data.scatterDamage.conditionalBullets(exLv, types));
              const avgConditionalBullets = conditionalBulletsPerRound.reduce((sum, val, idx) => 
                sum + val * powerRoundWeights[idx], 0);
              scatterBullets += avgConditionalBullets;
            }
            
            // 拡散ダメージ = AS発動率 × 拡散ダメージ/弾 × AS弾数 × 拡散弾数
            const totalScatterDamage = actualRate * scatterDamagePerBullet * asBullets * scatterBullets;
            const rushPartScatter = totalScatterDamage * (rushValue / 100);
            rushBonus += rushPartScatter;
            rushAdd(hero, i, 'plain', 'direct', '全軍突撃:拡散ダメージ', rushPartScatter);
          }

          // 磁場（磁気付与）の全突分
          titanEquip[i].forEach((equip, slotIdx) => {
            if (equip.effect === '磁場' && ['rifle', 'vision', 'handy'].includes(slotNames[slotIdx])) {
              const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '磁場');
              if (effect && effect.levels && effect.counts) {
                const magneticValue = effect.levels[equip.level - 1];
                const magneticCount = effect.counts[equip.level - 1];
                const magneticBoost = 100 + globalMagneticBoost + localMagneticBoosts[i];
                const rushPartMag = actualRate * magneticValue * magneticCount * magneticBoost / 100 * (rushValue / 100);
                rushMagneticBonus += rushPartMag;
                rushAdd(hero, i, 'abnormal', 'magnetic', '全軍突撃:磁場', rushPartMag, slotNames[slotIdx]);
              }
            }

            // 灼熱（燃焼付与）の全突分
            if (equip.effect === '灼熱' && ['rifle', 'vision', 'handy'].includes(slotNames[slotIdx])) {
              const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '灼熱');
              if (effect && effect.levels && effect.counts) {
                const burningValue = effect.levels[equip.level - 1];
                const burningCount = effect.counts[equip.level - 1];
                const burningBoost = 100 + globalBurningBoost + localBurningBoosts[i];
                const rushPartBurn = actualRate * burningValue * burningCount * burningBoost / 100 * (rushValue / 100);
                rushBurningBonus += rushPartBurn;
                rushAdd(hero, i, 'abnormal', 'burning', '全軍突撃:灼熱', rushPartBurn, slotNames[slotIdx]);
              }
            }

            // 破凱（脆弱付与）の全突分
            if (equip.effect === '破凱' && ['rifle', 'vision', 'handy'].includes(slotNames[slotIdx])) {
              const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '破凱');
              if (effect && effect.levels && effect.counts && effect.lossCoefs) {
                const vulnerValue = effect.levels[equip.level - 1];
                const vulnerCount = effect.counts[equip.level - 1];
                const lossCoef = effect.lossCoefs[equip.level - 1];
                const vulnerBoost = 100 + localVulnerBoosts[i] + globalVulnerableBoost;
                const vulnerDamage = actualRate * (totalDirectDamage / (totalDirectBullets || 1)) * 
                                    (vulnerValue / 100) * (vulnerCount * (lossCoef * 0.95)) * 
                                    (vulnerBoost / 100) / ((100 + totalAttackBuff) / 100);
                const rushPartVuln = vulnerDamage * (rushValue / 100);
                rushBonus += rushPartVuln;
                rushAdd(hero, i, 'plain', 'vulnerable', '全軍突撃:破凱', rushPartVuln, slotNames[slotIdx]);
              }
            }
          });

          // マゼリアのAS脆弱付与の全突分
          if (hero.name === 'マゼリア' && data.asVulnerable) {
            const { value: vulnerValue, count: vulnerCount, lossCoef } = data.asVulnerable;
            const vulnerBoost = 100 + localVulnerBoosts[i] + globalVulnerableBoost;
            const vulnerDamage = actualRate * (totalDirectDamage / (totalDirectBullets || 1)) *
                                 (vulnerValue / 100) * (vulnerCount * lossCoef * 0.95) *
                                 (vulnerBoost / 100) / ((100 + totalAttackBuff) / 100);
            const rushPartVuln = vulnerDamage * (rushValue / 100);
            rushBonus += rushPartVuln;
            rushAdd(hero, i, 'plain', 'vulnerable', '全軍突撃:AS脆弱', rushPartVuln);
          }
        }
      });
      
      // R1重み（火力用）を適用
      // 磁気・燃焼分は敵の異常ダメージ軽減を適用してから合算する
      const rushContribution = rushBonus * powerRoundWeights[0];
      const rushMagneticContribution = (rushMagneticBonus * powerRoundWeights[0]) / abnormalReductionDivisor;
      const rushBurningContribution = (rushBurningBonus * powerRoundWeights[0]) / abnormalReductionDivisor;
      totalASDamage += rushContribution + rushMagneticContribution + rushBurningContribution;
      totalMagneticDamage += rushMagneticContribution;
      totalBurningDamage += rushBurningContribution;
      rushParts.forEach(p => {
        const w = powerRoundWeights[0];
        const v = p.bucket === 'plain' ? p.raw * w : (p.raw * w) / abnormalReductionDivisor;
        ledgerAdd({ hero: p.hero, idx: p.idx, phase: 'AS', kind: p.kind, origin: 'titan', source: p.source, value: v, slot: p.slot });
      });
    }

    // ===== 覚醒スキル：ランク依存効果の増分計上 =====
    // 効果値はすべて heroData.js の awakening オブジェクトが決める。
    // shieldBonus / asDamageBonus は resolveShieldBuff / resolveAsDamage 経由で既に
    // 伝播済みなので、ここでは残りの効果（AS付随磁気・パッシブ磁気加算・再発動）だけを処理する。
    //
    // 【増分の考え方】
    //  ・asAttachedMagnetic：AS発動のたびに100%効果で発生する磁気ダメージ
    //  ・passiveMagneticDamageFlat：自身の毎ターン磁気ダメージへの単純加算（AS発動率とは無関係）
    //  ・reactivation：
    //      追加のAS発動期待値 = AS発動率 × 条件ラウンド(鉄壁継続)の火力重み係数の和 × 再発動確率
    //      再発動ASダメージ = 追加発動期待値 × ASダメージ（resolveAsDamageで覚醒加算込み） × 弾数 × ダメージ割合(ランク依存)
    //      AS付随効果（英雄固有の付随燃焼／覚醒スキルの付随磁気）は割合の影響を受けず、
    //      100%効果 × 追加発動期待値
    //  ・タイタンのAS付随効果と衰弱付与は、上流でトリガー確率(AS発動率×(1+factor))を使って加算済み
    //  ・全軍突撃とは独立。それぞれの増分は基本ASにだけ依存し、単純加算する
    //  ・各英雄は自分の awakening[i] から作られた効果だけを使うので、ランクは混線しない
    heroes.forEach((hero, i) => {
      const agg = awakeningEffects[i];
      if (!agg) return;
      const data = heroData[hero.name];
      const exLv = hero.exclusiveLv;
      const ranks = awakening[i] || {};

      const baseAsRate = typeof data.asRate === 'function' ? data.asRate(exLv) : (data.asRate || 0);
      const actualRate = baseAsRate * (9 - buffs.silenceCount) / 9 / 100;
      // 覚醒スキルのASダメージ加算込みの値（resolveAsDamageが内部で加算する）
      const effectiveAsDamage = resolveAsDamage(data, exLv, ranks);
      const baseAsBullets = typeof data.asBullets === 'function' ? data.asBullets(exLv) : (data.asBullets || 0);
      const magneticBoost = 100 + globalMagneticBoost + localMagneticBoosts[i];

      // --- asAttachedMagnetic：AS発動のたびに100%効果で発生する磁気ダメージ ---
      agg.attachedMagnetics.forEach(mag => {
        const dmg = (actualRate * mag.value * mag.count * magneticBoost / 100) / abnormalReductionDivisor;
        totalASDamage += dmg;
        ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'magnetic', origin: 'awakening', source: '覚醒:AS付随磁気' + (mag.skill ? '(スキル' + mag.skill + ')' : ''), value: dmg });
        totalMagneticDamage += dmg;
      });

      // --- passiveMagneticDamageFlat：自身の毎ターン磁気ダメージへの単純加算 ---
      if (agg.passiveMagneticDamageFlatSum > 0 && data.psMagneticBullets) {
        // 弾数は英雄本来のパッシブ磁気弾数なので、ルネの磁気弾数ボーナスを受ける
        // （覚醒スキルが加算するのは1発あたりのダメージ量だけで、弾数は増やさない）
        const bullets = typeof data.psMagneticBullets === 'function' ?
          data.psMagneticBullets(exLv) + runeMagneticBonus :
          data.psMagneticBullets + runeMagneticBonus;
        const dmg = (agg.passiveMagneticDamageFlatSum * bullets * magneticBoost / 100) / abnormalReductionDivisor;
        totalPSDamage += dmg;
        ledgerAdd({ hero: hero.name, idx: i, phase: 'PS', kind: 'magnetic', origin: 'awakening', source: '覚醒:パッシブ磁気加算', value: dmg });
        totalMagneticDamage += dmg;
      }

      // --- reactivation：スキル再発動 ---
      agg.reactivationEntries.forEach(({ reactivateAsEffects, damageRatio, factor }) => {
        const reactivateExpected = actualRate * factor;
        if (reactivateExpected <= 0) return;

        // 再発動したASのダメージ（ランク依存のダメージ割合を適用。覚醒ASダメ加算込み）
        const reactAsDamage = reactivateExpected * effectiveAsDamage * baseAsBullets * (damageRatio / 100);
        totalASDamage += reactAsDamage;
        ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'direct', origin: 'awakening', source: '覚醒:再発動AS', value: reactAsDamage });

        if (!reactivateAsEffects) return;

        // 英雄固有のAS付随燃焼（ルチルなど）：100%効果
        if (data.asBurning) {
          const burningBoost = 100 + globalBurningBoost + localBurningBoosts[i];
          const burningInfo = typeof data.asBurning === 'function' ? data.asBurning(hasYuzuha, hasNorshu) : data.asBurning;
          const reactBurningDamage = (reactivateExpected * burningInfo.value * burningInfo.count * burningBoost / 100) / abnormalReductionDivisor;
          totalASDamage += reactBurningDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'burning', origin: 'awakening', source: '覚醒:再発動燃焼', value: reactBurningDamage });
          totalBurningDamage += reactBurningDamage;
        }

        // 覚醒スキルに付随する磁気（ミヤのスキル2・スキル4など）：100%効果
        agg.attachedMagnetics.forEach(mag => {
          const reactMagDamage = (reactivateExpected * mag.value * mag.count * magneticBoost / 100) / abnormalReductionDivisor;
          totalASDamage += reactMagDamage;
          ledgerAdd({ hero: hero.name, idx: i, phase: 'AS', kind: 'magnetic', origin: 'awakening', source: '覚醒:再発動磁気' + (mag.skill ? '(スキル' + mag.skill + ')' : ''), value: reactMagDamage });
          totalMagneticDamage += reactMagDamage;
        });
      });
    });

    let heroBasePower = (100 + totalAttackBuff) / 100;
    let heroBaseDurability = (100 + totalShieldBuff) / 100;
    
    // 復讐ダメ減を英雄基礎耐久に加算（元のダメ減バフを考慮）
    // 復讐ダメ減による倍率：(100 + ダメ減 + 復讐ダメ減) / (100 + ダメ減)
    if (revengeDamageReduction > 0) {
      heroBaseDurability *= (100 + buffs.damageReduction + revengeDamageReduction) / (100 + buffs.damageReduction);
    }

    // ダメ増・ダメ減補正係数の計算
    // 補正係数 = (タイタン等による加算 + 元のバフ+100%) / (元のバフ+100%)
    let damageIncreaseCoeff = 1.0;
    let damageReductionCoeff = 1.0;
    
    // ソフィ編成ボーナス（ダメ増減各+20%）※ヒヨリ単独では発動しない
    let sofiDamageBoost = 0;
    const hasHiyori = heroes.some(h => h.name === 'ヒヨリ');
    const hasSofi = heroes.some(h => h.name === 'ソフィ');
    if (hasSofi) {
      sofiDamageBoost = 20;
    }
    
    // （ミスティ・アスカ・ユズハ・ノルシュの存在確認は、メインループより前に必要なため上部へ移動済み）
    
    // 鼓動効果の計算（通常攻撃のダメ増加算）
    let heartbeatDamageIncrease = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if (data.heartbeat) {
        const hb = typeof data.heartbeat === 'function' ? data.heartbeat(hero.exclusiveLv) : data.heartbeat;
        if (hb) {
          // ラウンドごとの累積値を計算: [value, value*2, value*2, value*2]（rounds分だけ累積）
          const perRound = [0, 0, 0, 0];
          for (let r = 0; r < 4; r++) {
            if (r < hb.rounds) {
              perRound[r] = hb.value * (r + 1);
            } else {
              perRound[r] = hb.value * hb.rounds;
            }
          }
          // 火力重み係数で平均
          const avgHeartbeat = perRound.reduce((sum, val, i) => 
            sum + val * powerRoundWeights[i], 0);
          heartbeatDamageIncrease += avgHeartbeat;
        }
      }
    });
    
    // 通常攻撃に鼓動効果を適用
    // 通常攻撃を (ダメ増+100+英雄ダメ増+鼓動) / (ダメ増+100+英雄ダメ増) の倍率で強化
    if (heartbeatDamageIncrease > 0) {
      // 英雄ダメ増効果 = ソフィ + シールド種類数 + リヴィア + ユズハ (後で計算)
      // ここでは一旦計算せず、後でtotalDamageIncreaseBonus確定後に適用
    }
    
    // リヴィアのPSダメ増バフ（ラウンドごと、火力重み係数で平均）
    let riviaDamageIncrease = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if ((hero.name === 'リヴィア' || hero.name === 'リヴィア（神秘）') && data.psDamageIncreasePerRound) {
        const damageIncreasePerRound = data.psDamageIncreasePerRound(hero.exclusiveLv, buffs.speedCondition, hasMisty, hasAsuka);
        if (damageIncreasePerRound) {
          riviaDamageIncrease = damageIncreasePerRound.reduce((sum, val, i) => 
            sum + val * powerRoundWeights[i], 0);
        }
      }
    });
    
    // ユズハのダメ増バフ（R1とR2～R4、火力重み係数で平均）
    let yuzuhaDamageIncrease = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if (hero.name === 'ユズハ' && data.damageIncreasePerRound) {
        const [r1Boost, r234Boost] = data.damageIncreasePerRound(hero.exclusiveLv);
        yuzuhaDamageIncrease = r1Boost * powerRoundWeights[0] + 
                               r234Boost * (powerRoundWeights[1] + powerRoundWeights[2] + powerRoundWeights[3]);
      }
    });
    
    // スネークアイズのPSダメ増
    let snakeEyesDamageIncrease = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if (hero.name === 'スネークアイズ' && data.psDamageIncrease) {
        snakeEyesDamageIncrease += data.psDamageIncrease;
      }
    });
    
    // メイメイのダメ増バフ加算（ラウンドごと、火力重み係数で平均）
    let meimeiDamageIncrease = 0;
    heroes.forEach(hero => {
      const data = heroData[hero.name];
      if (!data || data.name === '未実装' || data.name === '外す') return;
      
      if (hero.name === 'メイメイ' && data.damageIncreaseAddition) {
        const damageIncreasePerRound = data.damageIncreaseAddition(hero.exclusiveLv);
        meimeiDamageIncrease = damageIncreasePerRound.reduce((sum, val, i) => 
          sum + val * powerRoundWeights[i], 0);
      }
    });
    
    // 戦場洞察（タイタンON時）+ ソフィボーナス + レイチェル/マリナのシールド種類数ボーナス + リヴィア + ユズハ + スネークアイズ + メイメイ → ダメ増・ダメ減補正係数
    const totalDamageIncreaseBonus = (useTitan ? totalInsightValue : 0) + sofiDamageBoost + shieldTypesDamageIncrease + 
                                     riviaDamageIncrease + yuzuhaDamageIncrease + snakeEyesDamageIncrease + meimeiDamageIncrease;
    const totalDamageReductionBonus = (useTitan ? totalElusivenessValue : 0) + sofiDamageBoost + totalDamageReductionAddition;
    
    // 鼓動効果：通常攻撃と連撃にのみ作用する。
    // 磁気・燃焼・復讐・PS追加ダメージ・PS脆弱など、他のPSには作用しない。
    // 通常攻撃・連撃はどちらも直接ダメージ属性なので、PS集計と直接ダメージの両方に同じ増分を加える。
    if (heartbeatDamageIncrease > 0) {
      const heartbeatCoeff = (buffs.damageIncrease + 100 + totalDamageIncreaseBonus + heartbeatDamageIncrease) / 
                             (buffs.damageIncrease + 100 + totalDamageIncreaseBonus);
      const heartbeatBoost = (enhancedBasicAttack + totalComboDamage) * (heartbeatCoeff - 1);
      totalPSDamage += heartbeatBoost;
      totalDirectDamage += heartbeatBoost;
      // 台帳：鼓動が掛かった項目（通常攻撃・連撃）だけ係数を反映し、heartbeat タグを立てる
      damageLedger.forEach(e => {
        if (e.source === '通常攻撃' || e.source === '連撃') { e.value *= heartbeatCoeff; e.heartbeat = true; }
      });
      damageLedgerMeta.heartbeatCoeff = heartbeatCoeff;
    }
    
    if (totalDamageIncreaseBonus > 0) {
      damageIncreaseCoeff = (totalDamageIncreaseBonus + (buffs.damageIncrease + 100)) / (buffs.damageIncrease + 100);
      heroBasePower *= damageIncreaseCoeff;
    }
    if (totalDamageReductionBonus > 0) {
      damageReductionCoeff = (totalDamageReductionBonus + (buffs.damageReduction + 100)) / (buffs.damageReduction + 100);
      heroBaseDurability *= damageReductionCoeff;
    }

    // 鉄壁耐久補正の計算（破壊不能対応、各英雄で計算して最大値を採用）
    // タイタンOFFでも英雄の基礎値は適用される
    let ironWallCorrection = 1.0;
    
    if (hasIronWall) {
      let maxCorrection = 1.0;
      
      heroes.forEach((hero, i) => {
        const data = heroData[hero.name];
        if (!data || data.name === '未実装' || data.name === '外す' || !data.ironWallValue) return;
        
        const exLv = hero.exclusiveLv;
        const ironValue = data.ironWallValue(exLv);
        const ironRounds = data.ironWallRounds ? (typeof data.ironWallRounds === 'function' ? data.ironWallRounds(exLv) : data.ironWallRounds) : 1;
        
        // 基礎鉄壁耐久係数（タイタンOFFでも適用）
        let baseCorrection = 1.0;
        if (exLv < 5) {
          baseCorrection = 1.31;
        } else if (exLv === 5) {
          baseCorrection = 1.516;
        } else if (exLv >= 7) {
          baseCorrection = 1.8;
        }
        
        // 破壊不能による補正（タイタンONのみ）
        let destructibleBonus = 0;
        if (useTitan) {
          titanEquip[i].forEach((equip, slotIdx) => {
            if (equip.effect === '破壊不能' && slotNames[slotIdx] === 'armor') {
              const effect = titanEffects[slotNames[slotIdx]].effects.find(e => e.name === '破壊不能');
              if (effect && effect.levels) {
                const destructibleValue = effect.levels[equip.level - 1];
                
                // 破壊不能重み = (鉄壁ラウンド数+1)のラウンド重み
                // R1,R2,R3,R4以降 → index 0,1,2,3
                const roundIndex = Math.min(ironRounds, durabilityRoundWeights.length - 1);
                const destructibleWeight = durabilityRoundWeights[roundIndex];
                
                // 専用倍率込みの鉄壁値（％）
                const adjustedIronValue = ironValue * exclusiveMultipliers[exLv];
                
                // 補正計算: ((破壊不能重み/(1-(鉄壁値% × 破壊不能値%))) - 破壊不能重み)
                const denominator = 1 - (adjustedIronValue / 100) * (destructibleValue / 100);
                if (denominator > 0) {
                  destructibleBonus = (destructibleWeight / denominator) - destructibleWeight;
                }
              }
            }
          });
        }
        
        let finalCorrection = baseCorrection + destructibleBonus;
        
        // デュークなどの鉄壁補正係数の下方修正
　　　　　　　if (['デューク', 'デスコ'].includes(hero.name) && data.ironWallCorrectionAdjustment) {                const adjustment = data.ironWallCorrectionAdjustment(exLv);
          finalCorrection = 1+(finalCorrection-1 )* adjustment;
        }
        
        // 上限チェック
        if (exLv >= 7) {
          finalCorrection = Math.min(finalCorrection, 3.33);
        } else if (exLv >= 5) {
          finalCorrection = Math.min(finalCorrection, 2.0);
        }
        
        maxCorrection = Math.max(maxCorrection, finalCorrection);
      });
      
      ironWallCorrection = maxCorrection;
    }

    const passiveDamage = totalPSDamage;
    const heroPower = heroBasePower * (passiveDamage + totalASDamage) / 100;
    const heroDurability = heroBaseDurability * ironWallCorrection * totalDebuffDurabilityCorrection;
    const heroStrength = heroPower * heroDurability;

    // ダメージ属性の構造 → 実装は上の damageLedger（各項目にhero/phase/kind/originタグ）を参照
    // damageBreakdown = {
    //   direct: { // 直接ダメージ（脆弱の影響を受ける）
    //     as: AS直接ダメージの合計,
    //     normal: 通常攻撃ダメージ
    //   },
    //   magnetic: 磁気ダメージの合計,
    //   burning: 燃焼ダメージの合計,
    //   weaken: 衰弱値（耐久に寄与）,
    //   vulnerable: 脆弱値（直接ダメージ強化）
    // }

    // 追撃１発の火力重み
    // 追撃火力：ASとAS付随のダメージのうち、直接ダメージ + AS属性の脆弱（磁気・燃焼除外）
    // totalASDirectDamage は脆弱を含まないので、totalASVulnerableDamage を足しても二重計上にならない
    const rushRatio = totalASDirectBullets > 0 ? 
      ((totalASDirectDamage + totalASVulnerableDamage) / (totalASDamage + passiveDamage)) / totalASDirectBullets : 
      0;
    
    // 直接攻撃１発の平均ダメージ = (全直接ダメージ + 脆弱ダメージ) / 直接ダメージ弾数期待値
    // （PS脆弱は totalDirectDamage 側、AS脆弱は totalASVulnerableDamage 側にあり、互いに重複しない）
    const directDamagePerBullet = totalDirectBullets > 0 ?
      (totalDirectDamage + totalASVulnerableDamage) / totalDirectBullets :
      0;
    
    // 直接攻撃１発の火力重み = (直接ダメージ総計 / 総火力) / 直接弾数
    const directDamageRatio = totalDirectBullets > 0 ?
      ((totalDirectDamage + totalASVulnerableDamage) / (totalASDamage + passiveDamage)) / totalDirectBullets :
      0;
    
    // 追撃依存率 = 追撃総ダメージ / (追撃総ダメージ + パッシブダメージ)
    const rushDependencyRatio = (totalASDamage + passiveDamage) > 0 ?
      totalASDamage / (totalASDamage + passiveDamage) :
      0;

    // 磁気ダメージ依存率 = 磁気ダメージ合計 / (追撃総ダメージ + パッシブダメージ)
    const magneticDependencyRatio = (totalASDamage + passiveDamage) > 0 ?
      totalMagneticDamage / (totalASDamage + passiveDamage) :
      0;

    // 燃焼ダメージ依存率 = 燃焼ダメージ合計 / (追撃総ダメージ + パッシブダメージ)
    const burningDependencyRatio = (totalASDamage + passiveDamage) > 0 ?
      totalBurningDamage / (totalASDamage + passiveDamage) :
      0;

    return {
      heroBasePower,
      heroBaseDurability,
      damageIncreaseCoeff,
      damageReductionCoeff,
      totalASDamage,
      passiveDamage,
      asVulnerableDamage: totalASVulnerableDamage,
      psVulnerableDamage: totalPSVulnerableDamage,
      damageLedger: summarizeDamageLedger(damageLedger, damageLedgerMeta),
      ironWallCorrection,
      debuffDurabilityCorrection,
      armorDurabilityCorrection,
      totalDebuffDurabilityCorrection,
      rushRatio,
      directDamagePerBullet,
      directDamageRatio,
      rushDependencyRatio,
      magneticDependencyRatio,
      burningDependencyRatio,
      heroPower,
      heroDurability,
      heroStrength
    };
  };

  const withTitan = calculateHeroStats(titanEnabled);
  const withoutTitan = calculateHeroStats(false);

  const calcIncrease = (withVal, withoutVal) => {
    if (withoutVal === 0) return 0;
    return ((withVal - withoutVal) / withoutVal * 100).toFixed(1);
  };

  // 予想戦闘ターンの計算
  const calculateExpectedRounds = (myRatio, enemyRatio, powerDiff) => {
    // α = √(自火力耐久比) / √(想定戦力差 / 敵火力耐久比)
    const alpha = Math.sqrt(myRatio) / Math.sqrt(powerDiff / enemyRatio);
    
    // β = √(想定戦力差 × 敵火力耐久比) / √(1 / 自火力耐久比)
    const beta = Math.sqrt(powerDiff * enemyRatio) / Math.sqrt(1 / myRatio);
    
    // hpRratio = √(敵火力耐久比 / (想定戦力差 × 自火力耐久比))
    const hpRratio = Math.sqrt(enemyRatio / (powerDiff * myRatio));
    
    // 最大値 = 2 / √(α × β)
    const maxRoundLength = 2 / Math.sqrt(alpha * beta);
    
    let roundLength;
    
    // ①想定戦力差がそのままの方が小さい場合 (powerDiff < 1/powerDiff)
    // つまり powerDiff < 1
    if (powerDiff < 1 / powerDiff) {
      // roundLength = 1/√(α×β) × arctanh(√(β/α) × 1/hpRatio)
      const arg = Math.sqrt(beta / alpha) * (1 / hpRratio);
      
      // atanhの引数は-1から1の範囲でなければならない
      if (Math.abs(arg) >= 1) {
        // 発散する場合は最大値を使用
        roundLength = maxRoundLength;
      } else {
        roundLength = (1 / Math.sqrt(alpha * beta)) * Math.atanh(arg);
        
        // 発散対策：最大値を超えた場合
        if (!isFinite(roundLength) || roundLength > maxRoundLength) {
          roundLength = maxRoundLength;
        }
      }
    } else {
      // ②逆数の方が小さい場合 (1/powerDiff < powerDiff)
      // つまり powerDiff > 1
      // roundLength = 1/√(α×β) × arctanh(√(α/β) × hpRatio)
      const arg = Math.sqrt(alpha / beta) * hpRratio;
      
      // atanhの引数は-1から1の範囲でなければならない
      if (Math.abs(arg) >= 1) {
        // 発散する場合は最大値を使用
        roundLength = maxRoundLength;
      } else {
        roundLength = (1 / Math.sqrt(alpha * beta)) * Math.atanh(arg);
        
        // 発散対策：最大値を超えた場合
        if (!isFinite(roundLength) || roundLength > maxRoundLength) {
          roundLength = maxRoundLength;
        }
      }
    }
    
    return roundLength;
  };
  
  const expectedRounds = calculateExpectedRounds(buffs.myPowerDurabilityRatio, buffs.enemyPowerDurabilityRatio, buffs.powerDiff);

  // 相性火力補正の計算（表示のみ）
  // 【現状】「同兵種」「相性不利」は補正なし（bonus=1）として扱う。将来の拡張ポイント。
  let compatibilityPowerBonus = 1;
  let compatibilityDurabilityBonus = 1;
  if (compatibility === '相性有利') {
    // 相性火力補正＝(攻撃×火力乖離係数+兵種相性値)/(攻撃×火力乖離係数)
    compatibilityPowerBonus = (attackWithDivergence + (buffs.typeAdvantage || 0)) / attackWithDivergence;
    // 相性耐久補正＝(100+兵種相性値)/100
    compatibilityDurabilityBonus = ((buffs.typeAdvantage || 0) + 100) / 100;
  } else if (compatibility === '相性不利') {
    // 相性不利時（現状は補正なし。将来の拡張ポイント）
    compatibilityPowerBonus = 1;
    compatibilityDurabilityBonus = 1;
  } else {
    // 同兵種（現状は補正なし。将来の拡張ポイント）
    compatibilityPowerBonus = 1;
    compatibilityDurabilityBonus = 1;
  }

  // 表示値の計算（実際の計算値は変わらず、表示用のみ）
  const heroPower_display = withTitan.heroPower * compatibilityPowerBonus;
  const heroDurability_display = withTitan.heroDurability * compatibilityDurabilityBonus;
  const heroStrength_display = heroPower_display * heroDurability_display;

  const heroWithoutTitanPower_display = withoutTitan.heroPower * compatibilityPowerBonus;
  const heroWithoutTitanDurability_display = withoutTitan.heroDurability * compatibilityDurabilityBonus;
  const heroWithoutTitanStrength_display = heroWithoutTitanPower_display * heroWithoutTitanDurability_display;

  // 編成総合評価での相性増分を計算
  const compatibilityPowerBonusPercent = ((compatibilityPowerBonus - 1) * 100).toFixed(1);
  const compatibilityDurationBonusPercent = ((compatibilityDurabilityBonus - 1) * 100).toFixed(1);
  const compatibilityStrengthBonusPercent = ((compatibilityPowerBonus * compatibilityDurabilityBonus - 1) * 100).toFixed(1);

  return {
    typeWarning,
    compatDurability,
    baseCompatDurability,
    compatPower,
    baseCompatPower,
    compatStrength,
    baseCompatStrength,
    compatTroopDurability,
    baseCompatTroopDurability,
    compatTroopPower,
    baseCompatTroopPower,
    compatTroopStrength,
    baseCompatTroopStrength,
    compatTroopSoldierDurability,
    baseCompatTroopSoldierDurability,
    compatTroopSoldierPower,
    baseCompatTroopSoldierPower,
    compatTroopSoldierStrength,
    baseCompatTroopSoldierStrength,
    expectedRounds,
    ...withTitan,
    damageLedgerWithoutTitan: withoutTitan.damageLedger,
    // 相性補正を含めた表示値
    heroPower_display,
    heroDurability_display,
    heroStrength_display,
    heroWithoutTitanPower_display,
    heroWithoutTitanDurability_display,
    heroWithoutTitanStrength_display,
    // 編成総合評価（火力に火力乖離係数を適用）
    totalPower: withTitan.heroPower * compatTroopSoldierPower,
    totalDurability: withTitan.heroDurability * compatTroopSoldierDurability,
    // 編成の火力耐久比
    powerDurabilityRatio: (withTitan.heroPower * compatTroopSoldierPower) / (withTitan.heroDurability * compatTroopSoldierDurability),
    // 総合強さ値は1B^2がかからないように計算（火力乖離係数適用済み）
    totalStrength: (withTitan.heroPower * compatTroopSoldierPower / 1000000000) * (withTitan.heroDurability * compatTroopSoldierDurability / 1000000000),
    increases: {
      heroBasePower: calcIncrease(withTitan.heroBasePower, withoutTitan.heroBasePower),
      heroBaseDurability: calcIncrease(withTitan.heroBaseDurability, withoutTitan.heroBaseDurability),
      damageIncreaseCoeff: calcIncrease(withTitan.damageIncreaseCoeff, withoutTitan.damageIncreaseCoeff),
      damageReductionCoeff: calcIncrease(withTitan.damageReductionCoeff, withoutTitan.damageReductionCoeff),
      totalASDamage: calcIncrease(withTitan.totalASDamage, withoutTitan.totalASDamage),
      passiveDamage: calcIncrease(withTitan.passiveDamage, withoutTitan.passiveDamage),
      ironWallCorrection: calcIncrease(withTitan.ironWallCorrection, withoutTitan.ironWallCorrection),
      debuffDurabilityCorrection: calcIncrease(withTitan.debuffDurabilityCorrection, withoutTitan.debuffDurabilityCorrection),
      armorDurabilityCorrection: calcIncrease(withTitan.armorDurabilityCorrection, withoutTitan.armorDurabilityCorrection),
      totalDebuffDurabilityCorrection: calcIncrease(withTitan.totalDebuffDurabilityCorrection, withoutTitan.totalDebuffDurabilityCorrection),
      compatibilityPower: calcIncrease(heroPower_display, withTitan.heroPower),
      compatibilityDurability: calcIncrease(heroDurability_display, withTitan.heroDurability),
      compatibilityStrength: calcIncrease(heroStrength_display, withTitan.heroStrength),
      compatDurability: calcIncrease(compatDurability, baseCompatDurability),
      compatPower: calcIncrease(compatPower, baseCompatPower),
      compatStrength: calcIncrease(compatStrength, baseCompatStrength),
      compatTroopDurability: calcIncrease(compatTroopDurability, baseCompatTroopDurability),
      compatTroopPower: calcIncrease(compatTroopPower, baseCompatTroopPower),
      compatTroopStrength: calcIncrease(compatTroopStrength, baseCompatTroopStrength),
      compatTroopSoldierDurability: calcIncrease(compatTroopSoldierDurability, baseCompatTroopSoldierDurability),
      compatTroopSoldierPower: calcIncrease(compatTroopSoldierPower, baseCompatTroopSoldierPower),
      compatTroopSoldierStrength: calcIncrease(compatTroopSoldierStrength, baseCompatTroopSoldierStrength),
      heroPower: calcIncrease(withTitan.heroPower, withoutTitan.heroPower),
      heroDurability: calcIncrease(withTitan.heroDurability, withoutTitan.heroDurability),
      heroStrength: calcIncrease(withTitan.heroStrength, withoutTitan.heroStrength),
      totalPower: calcIncrease(withTitan.heroPower * compatTroopSoldierPower, withoutTitan.heroPower * compatTroopSoldierPower),
      totalDurability: calcIncrease(withTitan.heroDurability * compatTroopSoldierDurability, withoutTitan.heroDurability * compatTroopSoldierDurability),
      totalStrength: calcIncrease(
        (withTitan.heroPower * compatTroopSoldierPower / 1000000000) * (withTitan.heroDurability * compatTroopSoldierDurability / 1000000000),
        (withoutTitan.heroPower * compatTroopSoldierPower / 1000000000) * (withoutTitan.heroDurability * compatTroopSoldierDurability / 1000000000)
      ),
      compatibilityPowerBonus: parseFloat(compatibilityPowerBonusPercent),
      compatibilityDurationBonus: parseFloat(compatibilityDurationBonusPercent),
      compatibilityStrengthBonus: parseFloat(compatibilityStrengthBonusPercent)
    }
  };
}
