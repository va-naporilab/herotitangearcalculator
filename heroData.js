// heroData.js
// 英雄データ定義ファイル
// 新英雄を追加する場合はこのファイルのみ編集すればOK

// ==========================================================================
// 【他ファイルとの連携仕様】（calcEngine.js / index.html はここに書かれた形だけに依存する）
//
// ■ 編成コンテキスト ctx（条件付き効果すべてに共通で渡される）
//     ctx = buildTeamCtx(heroes, buffs) の戻り値。形はこのファイルだけで定義する。
//       { teamHeroes: ['ソフィ', 'アデル', ...],   // 同時編成の英雄名
//         speedCondition: '同攻速' | '攻速勝ち' | '攻速負け' }  // SPEED_CONDITIONS と同じ値
//     ・編成/攻速に依存する効果は、heroData側の関数が ctx を見て自分で判定する。
//       エンジンは hasXxx の旗を作らない。
//     ・ctx に項目を足したいときは buildTeamCtx を編集するだけでよい（エンジンは中身を見ない）。
//     ・ctx が未指定(undefined)でも落ちないこと。条件付き効果は「条件未達」として扱う。
//
// ■ 英雄データの条件付きフック（引数はすべて (ex, ctx) 形式。使わない引数は省略可）
//     asDamage(ex, ctx) / asExtraEffect(ex, ctx) / asBurning(ctx)
//     psBurning(ex, ctx) / psDamageIncreasePerRound(ex, ctx) / taunt(ex, ctx)
//     psBurningBoostPerRound(ex, ctx)
//     awakening.{shieldBonus, asDamageBonus, asBulletsBonus, globalMagneticBoost, ...}(ranks, exLv, ctx)
//     【連撃（psCombo を持つ英雄だけが読み取るローカル効果）】
//     psComboCumulativeBase(ex)                : PS連撃強化の累積基礎値（%）。calcCumulativeComboAverage(n) と掛けて「連撃強化」になる
//     psComboLocalBoost(ex, ctx)               : 自身の連撃にのみ加算されるローカル連撃強化（%）
//     awakening.comboCumulativeBaseBonus(ranks, exLv, ctx) : 累積基礎値への加算（%）
//     awakening.comboLocalBoost(ranks, exLv, ctx)          : ローカル連撃強化への加算（%）
//     awakening.comboCountBonus(ranks, exLv, ctx)          : 確率で連撃回数+1の配列 [{condition:'always'|'ironWallActive', triggerRate(%)}]
//     awakening.comboWeakenResist(ranks, exLv, ctx)        : 連撃ダメージにだけ掛かる衰弱抵抗 {prob(0〜1), resist(%)}（なしはnull）
//
// ■ エンジンが参照する統一ヘルパー（このファイル末尾側で定義）
//     resolveAsDamage / resolveAsBullets / resolveShieldBuff / resolveOpeningShield / buildTeamCtx
//
// ■ エンジンが英雄名ではなく「項目の有無」で拾う設計（英雄名を変更してもエンジンは壊れない）
//     例：scatterDamage / psVulnerableValue / asExtraEffect / taunt / psDebuffValue / asDebuff ...
//     フラグ：isMagneticHero（磁気英雄カウント）、partyDamageBoost（編成するだけで全体のダメ増減に加算）
//     ※ 新しい種類の効果を足すときは、既存と別の項目名にすること（同名で形が違うと衝突する）
//
// ■ 覚醒スキルのランクは ranks = { skill1, skill2, skill3, skill4 }（各0～10）
//
// ■ index.html が参照するもの
//     heroData（英雄名一覧・type・awakeningCapable）、SPEED_CONDITIONS
// ==========================================================================

// 攻速条件の選択肢（UIのボタン表示と、ctx.speedCondition の値の唯一の定義）
const SPEED_CONDITIONS = ['攻速勝ち', '同攻速', '攻速負け'];

// 編成コンテキストの組み立て（形の唯一の定義）。エンジンはこれを呼ぶだけ。
function buildTeamCtx(heroes, buffs) {
  return {
    teamHeroes: (heroes || []).map(h => h.name),
    speedCondition: buffs ? buffs.speedCondition : undefined
  };
}

const exclusiveMultipliers = { 0: 1.0, 3: 1.1, 5: 1.21, 7: 1.34 };

// ※覚醒スキルの効果値テーブルは「共通定義」を持たず、各英雄の awakening 内で都度定義する。
//   （英雄ごとに能力の細分化・条件追加が必要になっても、他の英雄に影響しないようにするため）

// ===== ASダメージ取得の統一ヘルパー =====
// data.asDamage は (ex, ctx) の形で呼び出す（ctxを使わない英雄は第2引数を無視するだけ）。
// ここで一本化して呼び出す。また、覚醒スキルによるASダメージ加算（data.awakening.asDamageBonus）
// も「同じ場所」で足し込んでおくことで、AS本体・全軍突撃・拡散ダメージ・スキル再発動など
// asDamageを使う計算エンジン側の全箇所に、加算後の値が自動的に伝播する。
// awakeningRanks は覚醒OFF時や非対応英雄の場合は null を渡せばよい（その場合は加算なし）。
// ctx（編成・攻速の文脈）は【全ての条件付き効果で共通の受け渡し形式】。
// 英雄ごとの関数は (ex, ctx) 形式で受け取り、編成判定は heroData 側で行う（エンジンは旗を作らない）：
//   { teamHeroes: ['アデル', ...],            // 同時編成している英雄名の配列
//     speedCondition: '同攻速'|'攻速勝ち'|'攻速負け' } // buffs.speedCondition と同じ値
// ctx 未指定の場合、編成条件付きの効果は「条件未達」として0扱い、攻速は '同攻速' 扱いになる。
function resolveAsDamage(data, exLv, awakeningRanks, ctx) {
  if (!data || typeof data.asDamage === 'undefined') return 0;
  let base;
  if (typeof data.asDamage === 'function') {
    base = data.asDamage(exLv, ctx);
  } else {
    base = data.asDamage || 0;
  }
  if (awakeningRanks && data.awakening && data.awakening.asDamageBonus) {
    base += data.awakening.asDamageBonus(awakeningRanks, exLv, ctx) || 0;
  }
  return base;
}

// ===== AS弾数取得の統一ヘルパー =====
// 覚醒スキルによる「AS弾数の期待値加算」（data.awakening.asBulletsBonus）を同じ場所で足し込む。
function resolveAsBullets(data, exLv, awakeningRanks, ctx) {
  if (!data || typeof data.asBullets === 'undefined') return 0;
  let base = typeof data.asBullets === 'function' ? data.asBullets(exLv) : (data.asBullets || 0);
  if (awakeningRanks && data.awakening && data.awakening.asBulletsBonus) {
    base += data.awakening.asBulletsBonus(awakeningRanks, exLv, ctx) || 0;
  }
  return base;
}

// ===== シールド関連の統一ヘルパー =====
// data.shieldBuff / data.openingShield のどちらを持つ英雄でも、
// 覚醒スキルによるシールド加算（data.awakening.shieldBonus）を同じ場所で足し込む。
function resolveShieldBuff(data, exLv, awakeningRanks) {
  let base = typeof data.shieldBuff === 'function' ? data.shieldBuff(exLv) : 0;
  if (awakeningRanks && data.awakening && data.awakening.shieldBonus) {
    base += data.awakening.shieldBonus(awakeningRanks, exLv) || 0;
  }
  return base;
}
function resolveOpeningShield(data, exLv, awakeningRanks) {
  let base = typeof data.openingShield === 'function' ? data.openingShield(exLv) : (data.openingShield || 0);
  if (awakeningRanks && data.awakening && data.awakening.shieldBonus) {
    base += data.awakening.shieldBonus(awakeningRanks, exLv) || 0;
  }
  return base;
}

// ===== PS連撃強化（累積型）の平均係数 =====
// 連撃回数 n に対し、k発目の連撃は (k-1)×累積基礎値 だけ強化される累積型の効果。
//   a = Σ_{i=1..整数部m} (m - i)  +  小数部f × (繰り上げ整数 - 1)   ※ 整数部mを使う（= m(m-1)/2 + f×m）
//   平均係数 = a / n  →  連撃強化(%) = 累積基礎値 × a / n
// nは「連撃回数＋覚醒による増加期待値」で、小数になりうる。
function calcCumulativeComboAverage(n) {
  if (!(n > 0)) return 0;
  const m = Math.floor(n + 1e-9);
  const f = n - m > 1e-9 ? n - m : 0;
  let a = 0;
  for (let i = 1; i <= m; i++) a += m - i;
  if (f > 0) a += f * (Math.ceil(n) - 1);
  return a / n;
}

const heroData = {
      '外す': {
        name: '外す',
        type: '汎用'
      },
      'ペトラ': {
        isMagneticHero: true,  // 磁気英雄の同時編成数カウント（アカネのAS拡散計算用）
        type: '陸軍',
        attackBuff: (ex) => 100 * exclusiveMultipliers[ex],
        magneticBoost: (ex) => ex >= 7 ? 120 : 70,
        asRate: 37,
        asDamage: (ex) => 60 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 5 ? 5 : 4,
        asExtraEffect: (ex, ctx) => {
          // ペトラ/フランカ と ミヤ/クラリス の同時編成で発動
          const team = (ctx && ctx.teamHeroes) || [];
          const hasCombo = (team.includes('ペトラ') || team.includes('フランカ')) && (team.includes('ミヤ') || team.includes('クラリス'));
          return hasCombo ? { damage: 50, bullets: (ex >= 5 ? 5 : 4) * 0.5 * 1.5, type: 'magnetic' } : null;
        }
      },
      'フランカ': {
        isMagneticHero: true,  // 磁気英雄の同時編成数カウント（アカネのAS拡散計算用）
        type: '陸軍',
        attackBuff: (ex) => 115 * exclusiveMultipliers[ex],
        magneticBoost: (ex) => {
          if (ex >= 5) return 120;  // 専5以上: +120%（専7でも同じ）
          return 70;                // 専4以下: +70%
        },
        asRate: 37,
        asDamage: (ex) => 70 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 7 ? 5 : 4,  // 専7以上で5発、それ以下で4発
        asExtraEffect: (ex, ctx) => {
          // ペトラ/フランカ と ミヤ/クラリス の同時編成で発動
          const team = (ctx && ctx.teamHeroes) || [];
          const hasCombo = (team.includes('ペトラ') || team.includes('フランカ')) && (team.includes('ミヤ') || team.includes('クラリス'));
          return hasCombo ? { damage: 50, bullets: (ex >= 7 ? 5 : 4) * 0.5 * 1.5, type: 'magnetic' } : null;
        }
      },
      'ミヤ': {
        type: '陸軍',
        awakeningCapable: true,
        shieldBuff: (ex) => 68 * exclusiveMultipliers[ex],
        asRate: 34,
        asDamage: (ex) => 60 * exclusiveMultipliers[ex],
        asBullets: 4,
        psMagneticDamage: (ex) => ex >= 5 ? 60 : 40,
        psMagneticBullets: (ex) => {
          let base = 2.2;
          if (ex >= 7) base += 2.4;  // 専7: 2.2 + 2.4 = 4.6個
          else if (ex >= 5) base += 1.0;  // 専5: 2.2 + 1.0 = 3.2個
          return base;
        },
        // ===== 覚醒スキル =====
        // 効果値・「どのスキルが何ランクでどう作用するか」は全てここ（heroData.js）で計算し、
        // 計算エンジン側には最終的な数値（または再発動のような複雑効果のみ小さな記述）を返す。
        // エンジン側は「このプロパティ名が存在すれば、対応する場所に加算する」というだけの
        // 単純な参照処理しか持たない（type別の分岐処理などは持たない）。
        //
        // 引数の (ranks, exLv) の ranks は { skill1, skill2, skill3, skill4 } で、各覚醒スキルのランク(0～10)。
        //
        // 各プロパティ一覧：
        //   shieldBonus(ranks, exLv)               : 開戦シールドへの加算値（%、単純加算）
        //   asDamageBonus(ranks, exLv, ctx)         : ASダメージへの加算値（%、期待値込み）。ctx = { teamHeroes, speedCondition }
        //   asBulletsBonus(ranks, exLv, ctx)        : AS弾数への加算値（期待値、発）
        //   attachedMagnetics(ranks, exLv)          : AS発動のたびに付随する磁気ダメージの配列 [{value, count, skill?}, ...]（skillは台帳表示用のスキル番号）
        //   passiveMagneticDamageBonus(ranks, exLv) : 自身のパッシブ磁気ダメージへの加算値（%、単純加算）
        //   globalMagneticBoost(ranks, exLv, ctx)   : 全英雄の磁気ダメージに掛かるグローバル磁気強化への加算値（%）。編成条件ありの場合はctx.teamHeroesで判定
        //   magneticBurningReduction(ranks, exLv)   : 敵の磁気燃焼ダメージ軽減効果への加算値（新規・耐久側効果）
        //   globalBurningBoost(ranks, exLv, ctx)    : 全英雄の燃焼ダメージに掛かるグローバル燃焼強化への加算値（%）。編成条件ありの場合はctx.teamHeroesで判定
        //   passiveDirects(ranks, exLv, ctx)        : パッシブ(PS)直接ダメージの配列 [{value, count, rate, skill?}, ...]（期待値 = rate×value×count）
        //   attachedDirects(ranks, exLv, ctx)       : AS発動のたびに付随する直接ダメージの配列 [{value, count, skill?}, ...]（絶対値ダメージ）
        //   revengeDamageBonus(ranks, exLv, ctx)    : 復讐1発あたりのダメージ(%)への加算値。採用された復讐がその英雄のときのみ有効
        //   revengeExtraShots(ranks, exLv, ctx)     : 復讐のmultiplierを確率で加算する追加復讐の配列 [{value, prob, multiplierAdd, skill?}, ...]（value=追加分1発のダメージ%。個数 = 復讐count×multiplierAdd×prob）
        //   psAdditionalDamageBonus(ranks, exLv, ctx): PS追加ダメージ1発あたりのダメージ(%)への加算値
        //   psAdditionalMultiplierBonus(ranks, exLv, ctx): PS追加ダメージの multiplier への加算値（期待値。弾数 = count×(multiplier+加算)）
        //   scatterBaseDamageBonus(ranks, exLv, ctx): 拡散ダメージ(scatterDamage)の baseDamage(%)への加算値
        //   scatterBulletsBonus(ranks, exLv, ctx)   : 拡散弾数への加算値（期待値、発）
        //   silenceReduction(ranks, exLv, ctx)      : 被沈黙数(敵から受ける沈黙数)の減少割合の期待値（0〜1）。エンジンは 被沈黙数×(1−値) で適用（複数英雄は掛け合わせ）
        //   reactivation(ranks, exLv, ctx)          : スキル再発動の記述（再発動しない場合はnullを返す）
        //     → { condition, triggerRate, damageRatio, reactivateAsEffects } の形のみ、
        //       計算エンジン側での解釈（鉄壁ラウンド判定・発動率補正など）が必要なため、これだけは構造を持つ。
        awakening: {
          // スキル1：開戦シールド加算（ランク1以上）＋ ASダメージ加算（ランク6以上）
          // （この英雄専用の定義。他英雄とは共有しない）
          shieldBonus: (ranks, exLv) => {
          if (!ranks.skill1 || ranks.skill1 <= 0) return 0;
          const table = [1, 2, 3, 4.5, 6, 8, 10, 13, 16, 20]; // index: rank-1
          let v = table[ranks.skill1 - 1] || 0;
          if (exLv >= 7) v *= 1.5;
          return v;
        },
          asDamageBonus: (ranks) => {
          const table = { 6: 1.5, 7: 3, 8: 4.5, 9: 7, 10: 10 };
          return table[ranks.skill1] || 0;
        },

          // スキル2：AS付随磁気の解禁（ランク1以上）＋ 磁気燃焼ダメージ軽減（ランク6以上）
          // ・AS付随磁気の弾数は専7以上で6発、専6以下で4発（ランクには依存しない）
          // ・磁気燃焼ダメージ軽減は新規の耐久側効果（相性環境設定の「敵の磁気燃焼依存率」と組み合わせて使う）
          attachedMagnetics: (ranks, exLv) => {
            const list = [];
            const magneticTable = [22, 24, 26, 29, 32, 36, 40, 46, 52, 60];
            if (ranks.skill2 > 0) {
              list.push({ value: magneticTable[ranks.skill2 - 1] || 0, count: exLv >= 7 ? 6 : 4, skill: 2 });
            }
            // スキル4：ランク6以上で解禁する新規AS付随磁気（弾数4固定・別枠）
            const extraMagneticTable = { 6: 26, 7: 32, 8: 38, 9: 48, 10: 60 };
            if (extraMagneticTable[ranks.skill4] !== undefined) {
              list.push({ value: extraMagneticTable[ranks.skill4], count: 4, skill: 4 });
            }
            return list;
          },
          magneticBurningReduction: (ranks) => {
            const table = { 6: 3.75, 7: 7.5, 8: 11.25, 9: 17.5, 10: 25 };
            return table[ranks.skill2] || 0;
          },

          // スキル3：グローバル磁気効果強化（ランク1以上）＋ スキル再発動の解禁（ランク6以上）
          // ★どちらも「フランカとルネを同時編成」している場合のみ有効
          // ・グローバル磁気効果強化は専7以上で1.5倍
          // ・再発動の確率・ダメージ割合はこの英雄内で定義（ルチルとは共有しない）
          // ★発動条件：フランカとルネを同時編成していること（ctx.teamHeroes に両方含まれる場合のみ）
          globalMagneticBoost: (ranks, exLv, ctx) => {
            if (!ranks.skill3 || ranks.skill3 <= 0) return 0;
            const team = (ctx && ctx.teamHeroes) || [];
            if (!(team.includes('フランカ') && team.includes('ルネ'))) return 0;
            const table = [2.5, 5, 7.5, 11.25, 15, 20, 25, 32.5, 40, 50];
            let v = table[ranks.skill3 - 1] || 0;
            if (exLv >= 7) v *= 1.5;
            return v;
          },
          reactivation: (ranks, exLv, ctx) => {
            // ★ランク6以上の再発動も、フランカ と ルネ を同時編成している場合のみ有効
            const team = (ctx && ctx.teamHeroes) || [];
            if (!(team.includes('フランカ') && team.includes('ルネ'))) return null;
            // ランク6以上で解禁（テーブルに無いランクは再発動なし）
            const damageTable = { 6: 7.5, 7: 15, 8: 22.5, 9: 35, 10: 50 };
            const damageRatio = damageTable[ranks.skill3];
            if (damageRatio === undefined) return null;
            return {
              condition: 'ironWallActive',                    // 鉄壁が有効なラウンド
              triggerRate: 60,                                 // 再発動確率(%)：60%固定
              damageRatio: damageRatio,                        // 再発動ASダメージ割合(%)：ランク依存
              reactivateAsEffects: true                        // AS付随効果（付随磁気・付随燃焼）は100%で再発動
            };
          },

          // スキル4：パッシブ磁気ダメージ加算（ランク1以上）
          // ・専7以上で1.5倍。ランク6以上のAS付随磁気は attachedMagnetics 側にまとめてある
          // ※台帳の表示用：この加算が属するスキル番号（任意。無ければ番号なしで表示）
          passiveMagneticSkill: 4,
          passiveMagneticDamageBonus: (ranks, exLv) => {
            if (!ranks.skill4 || ranks.skill4 <= 0) return 0;
            const table = [2, 4, 6, 9, 12, 16, 20, 26, 32, 40];
            let v = table[ranks.skill4 - 1] || 0;
            if (exLv >= 7) v *= 1.5;
            return v;
          }
        }
      },
      'クラリス': {
        type: '陸軍',
        openingShield: (ex) => 65 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex) => {
          const base = 80 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 50 : base;
        },
        asBullets: 3,
        psMagneticDamage: (ex) => ex >= 5 ? 60 : 40,
        psMagneticBullets: (ex) => {
          let base = 2;
          if (ex >= 7) base += 2;  // 専7: 2 + 2 = 4発
          else if (ex >= 5) base += 1;  // 専5: 2 + 1 = 3発
          return base;
        }
      },
      'ノーラ': {
        type: '海軍',
        attackBuff: (ex) => 110 * exclusiveMultipliers[ex],
        // 沈黙効果
        silenceCount: 3,
        // PSの衰弱付与（1ラウンドに1度）
        psDebuffValue: 30,
        psDebuffCount: (ex) => ex >= 5 ? 4 : 3,
        psDebuffRate: (ex) => ex >= 5 ? 44.4 : 33.3,
        // PSの脆弱付与（1ラウンドに1度、確率11.11%）
        // ダメージ量は計算エンジンが「平均の直接1発」から算出する（破凱・マゼリアと同じ脆弱ロジック）
        psVulnerableValue: 30,
        psVulnerableCount: (ex) => ex >= 7 ? 4 : 3,
        psVulnerableLossCoef: 0.98,
        psVulnerableTriggerRate: 11.11 / 100,
        // グローバル効果
        globalDebuffBoost: (ex) => ex >= 5 ? 40 : 0,
        globalVulnerableBoost: (ex) => ex >= 5 ? 60 : 0,
        globalASDamageMultiplier: (ex) => ex >= 7 ? 1.12 : 1.0,
        specialHeroesASDamageMultiplier: (ex) => ex >= 7 ? 1.22 : 1.0,
        specialHeroes: ['ミーク', 'マゼリア', 'アイリス', 'ソフィ', 'ヒヨリ','デスコ']
      },
      'アデル': {
        type: '海軍',
        attackBuff: (ex) => 110 * exclusiveMultipliers[ex],
        // 沈黙効果
        silenceCount: 3,
        // PSの衰弱付与（1ラウンドに1度）
        psDebuffValue: 30,
        psDebuffCount: (ex) => 4,
        psDebuffRate: (ex) => 44.4,
        // PSの脆弱付与（1ラウンドに1度、確率11.11%）
        // ダメージ量は計算エンジンが「平均の直接1発」から算出する（破凱・マゼリアと同じ脆弱ロジック）
        psVulnerableValue: (ex) => ex >= 7 ? 40 : 30,
        psVulnerableCount: (ex) => 4,
        psVulnerableLossCoef: 0.98,
        psVulnerableTriggerRate: 11.11 / 100,
        // グローバル効果
        globalDebuffBoost: (ex) => ex >= 5 ? 40 : 0,
        globalVulnerableBoost: (ex) => ex >= 5 ? 60 : 0,
        globalASDamageMultiplier: (ex) => ex >= 7 ? 1.12 : ex >= 5 ? 1.04 : 1.0,
        specialHeroesASDamageMultiplier: (ex) => ex >= 7 ? 1.24 : ex >= 5 ? 1.08 : 1.0,
        specialHeroes: ['ミーク', 'マゼリア', 'アイリス', 'ソフィ', 'ヒヨリ','デスコ']
      },
      'ツバキ': {
        type: '海軍',
        attackBuff: (ex) => 108 * exclusiveMultipliers[ex],
        // 沈黙効果：専5未満で2、専5以上で3
        silenceCount: (ex) => ex >= 5 ? 3 : 2,
        // PSの衰弱付与（1ラウンドに1度）
        psDebuffValue: 30,
        psDebuffCount: (ex) => ex >= 7 ? 4 : 3,
        psDebuffRate: (ex) => ex >= 7 ? 44.4 : 33.3,
        // グローバル効果
        globalDebuffBoost: (ex) => ex >= 5 ? 40 : 0,
        globalVulnerableBoost: (ex) => ex >= 5 ? 40 : 0,
        globalASDamageMultiplier: (ex) => ex >= 7 ? 1.12 : 1.0,
        specialHeroesASDamageMultiplier: (ex) => ex >= 7 ? 1.22 : 1.0,
        specialHeroes: ['ミーク', 'アイリス', 'ソフィ', 'ヒヨリ']
      },
      'ルネ': {
        type: '陸軍',
        ironWallValue: (ex) => (ex >= 7 ? 50 : 40) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        asRate: 33,
        asDamage: (ex) => 150 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 5 ? 4 : 3,
        magneticBulletsBonus: (ex) => ex >= 7 ? 1.0 : 0.5
      },
      'アカネ': {
        isMagneticHero: true,  // 磁気英雄の同時編成数カウント（アカネのAS拡散計算用）
        type: '陸軍',
        attackBuff: (ex) => 95 * exclusiveMultipliers[ex],
        magneticBoost: (ex) => ex >= 3 ? 110 : 20,
        asRate: 37,
        asDamage: (ex) => 55 * exclusiveMultipliers[ex],
        asBullets: 4,
        // AS拡散ダメ（複雑な計算が必要）
        asScatterDamage: (ex, magneticBulletsExpected, magneticHeroCount) => {
          const baseDamage = ex >= 7 ? 30 : 10;
          const adjustedMagnetic = magneticBulletsExpected / (1 + magneticHeroCount);
          const scatterMultiplier = Math.min(adjustedMagnetic * 9 / 13.3, 5);
          const scatterBullets = ex >= 5 ? 2 : 1;
          return { damage: baseDamage * scatterMultiplier, bullets: scatterBullets };
        },
        // PS磁気（専用7以上で各ラウンドに1度）
        psMagnetic: (ex) => ex >= 7 ? { value: 50, count: 6, rate: 0.11 } : null
      },
      'アリア＆ティナ': {
        type: '汎用',
        attackBuff: (ex) => 90 * exclusiveMultipliers[ex],
        asRate: (ex) => ex >= 5 ? 35 : 27,
        asDamage: (ex) => {
          const baseDamage = 130 * exclusiveMultipliers[ex];
          const bonusDamage = ex >= 7 ? 130 : 0;
          return baseDamage + bonusDamage;
        },
        asBullets: 3,
        // 脆弱の敵にAS命中時のダメージ変化（確率：脆弱数期待値／直接攻撃弾数期待値）
        asVulnerableBonus: 190,
        // PS脆弱付与（専5以上で1ラウンドに1度）
        psVulnerableFromDirect: (ex) => {
          if (ex < 5) return null;
          const count = ex >= 7 ? 4 : 2;
          return { value: 30, count: count, rate: 0.11 };
        }
      },
      'フェルム': {
        isMagneticHero: true,  // 磁気英雄の同時編成数カウント（アカネのAS拡散計算用）
        type: '陸軍',
        attackBuff: (ex) => 90 * exclusiveMultipliers[ex],
        magneticBoost: (ex) => {
          if (ex >= 7) return 30 + 40 + 30; // 100
          if (ex >= 5) return 30 + 40; // 70
          return 30;
        },
        asRate: 42,
        asDamage: (ex) => {
          const baseDamage = 50 * exclusiveMultipliers[ex];
          const bonusDamage = ex >= 7 ? 30 : 0;
          return baseDamage + bonusDamage;
        },
        asBullets: 4,
        // PS磁気（専5以上で各ラウンドに1度）
        psMagnetic: (ex) => ex >= 5 ? { value: 60, count: 5, rate: 0.11 } : null
      },
      'デューク': {
        type: '汎用',
        ironWallValue: (ex) => (38 + (ex >= 7 ? 10 : 0)) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        // 鉄壁補正係数の下方修正：(1-40%の場合の鉄壁値×専用) / (1-当英雄の鉄壁値×専用)
        ironWallCorrectionAdjustment: (ex) => {
          // 専7以上の場合、standard40Valueも+10する
          const standard40Value = (40 + (ex >= 7 ? 10 : 0)) * exclusiveMultipliers[ex];
          const dukeValue = (38 + (ex >= 7 ? 10 : 0)) * exclusiveMultipliers[ex];
          return (1 - standard40Value / 100) / (1 - dukeValue / 100);
        },
        asRate: 36,
        asDamage: (ex) => {
          const base = 130 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 80 : base;
        },
        asBullets: 3,
        // 衰弱効果：衰弱値15%、衰弱率29%
        asDebuff: (ex) => ({ value: 15, rate: 0.29 }),
        // 鼓動効果：専5以上で20%×3ラウンド
        heartbeat: (ex) => ex >= 5 ? { value: 20, rounds: 3 } : null
      },

      'ミーチェ': {
        type: '陸軍',
        ironWallValue: (ex) => (40 + (ex >= 7 ? 10 : 0)) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        asRate: 32,
        asDamage: (ex) => 130 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 5 ? 4 : 3,
        // 開戦シールド：専7以上で15%
        openingShield: (ex) => ex >= 7 ? 15 : 0,
        // AS付随ダメ減（ラウンドごとの累積計算）
        asDamageReduction: (ex, asRate, hasRush) => {
          // R1での発動数期待値（全突がある場合は2倍）
          const r1Expected = asRate * (hasRush ? 2 : 1);
          const normalExpected = asRate;
          
          // 各ラウンドでの累積発動数とダメ減加算
          const r1Reduction = r1Expected * 0.05 - 0.5 * (r1Expected * 0.05);
          const r2Reduction = (r1Expected + normalExpected) * 0.05 - 0.5 * (normalExpected * 0.05);
          const r3Reduction = (r1Expected + normalExpected * 2) * 0.05 - 0.5 * (normalExpected * 0.05);
          const r4Reduction = (r1Expected + normalExpected * 3) * 0.05 - 0.5 * (normalExpected * 0.05);
          
          return [r1Reduction, r2Reduction, r3Reduction, r4Reduction];
        }
      },
      'シャーリー': {
        type: '陸軍',
        shieldBuff: (ex) => {
          const base = 50 * exclusiveMultipliers[ex];
          return ex >= 5 ? base + 30 : base;
        },
        // 耐性効果：R1のみ6個
        resistance: { count: 6, round: 1 },
        // 復讐効果：1ラウンドに1度
        revenge: (ex) => ({
          count: ex >= 7 ? 9 : 6,
          multiplier: 2,  // x2個
          rate: 0.1111,  // 11.11%
          reductionRate: 20 * exclusiveMultipliers[ex],  // 復讐ダメ減値
          damage: (() => {
            const base = 90;
            if (ex >= 7) return base + 45 + 25;  // 160
            if (ex >= 5) return base + 45;  // 135
            return base;
          })()
        }),
        // PS追加ダメージ：1ラウンドに1度
        psAdditionalDamage: (ex) => ({
          damage: 15,
          multiplier: 2,
          count: ex >= 7 ? 9 : 6,
          rate: 0.1111
        })
      },
      'メル': {
        type: '陸軍',
        awakeningCapable: true,
        // シールド強化バフ
        shieldBuff: (ex) => {
          if (ex >= 7) {
            return 95 * exclusiveMultipliers[ex];  // 専7：95%
          }
          if (ex >= 5) {
            return 55 * exclusiveMultipliers[ex];  // 専5-6：55%
          }
          // 専0-4：55%
          return 55 * exclusiveMultipliers[ex];
        },
        // 耐性効果：R1のみ6個（シャーリーから変化なし）
        resistance: { count: 6, round: 1 },
        // 復讐効果：1ラウンドに1度
        revenge: (ex) => ({
          count: ex >= 7 ? 9 : (ex >= 5 ? 9 : 6),  // 専5以上で9個
          multiplier: 2,  // x2個
          rate: 0.1111,  // 11.11%
          reductionRate: 25 * exclusiveMultipliers[ex],  // 復讐ダメ減値：20% → 25%
          damage: (() => {
            const base = 95;  // 専0-4：95%（90% → 95%）
            if (ex >= 7) return base + 75;  // 170%（95 + 75）
            if (ex >= 5) return base + 25;  // 120%（95 + 25）
            return base;
          })()
        }),
        // PS追加ダメージ：1ラウンドに1度
        psAdditionalDamage: (ex) => ({
          damage: 20,  // 15% → 20%（全専用レベル共通）
          multiplier: 2,
          count: ex >= 7 ? 9 : (ex >= 5 ? 9 : 6),
          rate: 0.1111
        }),
        // ===== 覚醒スキル =====
        // プロパティの意味はミヤの定義コメントを参照（このファイル内で共通の設計）。
        // ※復讐系の効果は「エンジンが採用した復讐（最大ダメージの1英雄）がこの英雄の場合のみ」有効。
        awakening: {
          // スキル1：開戦シールド加算（ランク1以上）＋ 復讐ダメージ加算（ランク6以上）
          shieldBonus: (ranks, exLv) => {
            if (!ranks.skill1 || ranks.skill1 <= 0) return 0;
            const table = [1, 2, 3, 4.5, 6, 8, 10, 13, 16, 20]; // index: rank-1
            let v = table[ranks.skill1 - 1] || 0;
            if (exLv >= 7) v *= 1.5;
            return v;
          },

          // 復讐ダメージ加算（復讐1発あたりのダメージ%に単純加算。復讐ダメ強化(revengeBoost)はこの後に掛かる）
          //   スキル1：ランク6以上（専用倍率なし）
          //   スキル3：立華つむぎとミーチェを同時編成している場合のみ。専7以上で1.5倍
          //   スキル4：ランク1以上。専7以上で1.5倍
          revengeDamageBonus: (ranks, exLv, ctx) => {
            const team = (ctx && ctx.teamHeroes) || [];
            const exMul = exLv >= 7 ? 1.5 : 1;
            let total = 0;
            const s1Table = { 6: 1.5, 7: 3, 8: 4.5, 9: 7, 10: 10 };
            total += s1Table[ranks.skill1] || 0;
            if (ranks.skill3 > 0 && team.includes('立華つむぎ') && team.includes('ミーチェ')) {
              const s3Table = [0.6, 1.2, 1.8, 2.7, 3.6, 4.8, 6, 7.8, 9.6, 12]; // index: rank-1
              total += (s3Table[ranks.skill3 - 1] || 0) * exMul;
            }
            if (ranks.skill4 > 0) {
              const s4Table = [0.75, 1.5, 2.25, 3.38, 4.5, 6, 7.5, 9.75, 12, 15]; // index: rank-1
              total += (s4Table[ranks.skill4 - 1] || 0) * exMul;
            }
            return total;
          },
          // スキル4：ランク6以上で、54%の確率で復讐の multiplier を+1する（復讐 count × 1 個ぶんの追加復讐）
          //   ・追加分の復讐は1発あたりのダメージ量が別（ランク依存）なので、通常の復讐とは別枠で計算する
          //     （復讐ダメージ加算は乗らない。復讐ダメ強化 revengeBoost は掛かる）
          //   ・追加分の期待個数は復讐ダメ減の個数にも加算される
          //   ・復讐個数ボーナス(revengeCountBonus)は multiplier の外なので、追加分には含まれない
          revengeExtraShots: (ranks) => {
            const table = { 6: 27, 7: 39, 8: 51, 9: 71, 10: 95 };
            const v = table[ranks.skill4];
            return v === undefined ? [] : [{ value: v, prob: 0.54, multiplierAdd: 1, skill: 4 }];
          },

          // PS追加ダメージのダメージ量加算（1発あたりのダメージ%に単純加算）
          //   スキル2：ランク1以上。専7以上で1.5倍
          //   スキル3：ランク6以上（専用倍率なし）。立華つむぎとミーチェを同時編成している場合のみ
          psAdditionalDamageBonus: (ranks, exLv, ctx) => {
            const team = (ctx && ctx.teamHeroes) || [];
            let total = 0;
            if (ranks.skill2 > 0) {
              const s2Table = [0.6, 1.2, 1.8, 2.7, 3.6, 4.8, 6, 7.8, 9.6, 12]; // index: rank-1
              total += (s2Table[ranks.skill2 - 1] || 0) * (exLv >= 7 ? 1.5 : 1);
            }
            if (team.includes('立華つむぎ') && team.includes('ミーチェ')) {
              const s3Table = { 6: 1.5, 7: 3, 8: 4.5, 9: 7, 10: 10 };
              total += s3Table[ranks.skill3] || 0;
            }
            return total;
          },
          // スキル2：ランク6以上で、確率でPS追加ダメージの multiplier を+1する（期待値＝確率×1。専用倍率なし）
          //   例：専5以上(count=9, multiplier=2)で確率100%なら 18発 → 27発
          psAdditionalMultiplierBonus: (ranks) => {
            const rateTable = { 6: 9, 7: 18, 8: 27, 9: 42, 10: 60 }; // %
            return (rateTable[ranks.skill2] || 0) / 100;
          }
        }
      },
      'スネークアイズ': {
        type: '陸軍',
        shieldBuff: (ex) => {
          const base = 50 * exclusiveMultipliers[ex];
          return ex >= 5 ? base + 26.6 : base;
        },
        // 耐性効果：専7以上でR1のみ6個
        resistance: (ex) => ex >= 7 ? { count: 6, round: 1 } : null,
        // 復讐効果：1ラウンドに1度
        revenge: (ex) => ({
          count: 6,
          multiplier: 2,
          rate: 0.1111,
          reductionRate: 20 * exclusiveMultipliers[ex],  // 復讐ダメ減値
          damage: (() => {
            const base = 80;
            if (ex >= 7) return base + 40 + 40;  // 160
            if (ex >= 5) return base + 40;  // 120
            return base;
          })()
        }),
        // PSダメ増：10%
        psDamageIncrease: 10
      },
      'カトレア': {
        type: '陸軍',
        attackBuff: (ex) => 105 * exclusiveMultipliers[ex],
        // 復讐ダメージ強化：+39%（専5で+25%、専7で+50%）
        revengeBoost: (ex) => {
          let boost = 39;
          if (ex >= 7) boost += 25 + 50;  // 39 + 75 = 114
          else if (ex >= 5) boost += 25;  // 39 + 25 = 64
          return boost;
        },
        // 復讐個数増加：+6個
        revengeCountBonus: 6
      },
      '立華つむぎ': {
        type: '陸軍',
        attackBuff: (ex) => 115 * exclusiveMultipliers[ex],
        // 復讐ダメージ強化：+44%（専5で+28%、専7で+52%）
        revengeBoost: (ex) => {
          let boost = 44;
          if (ex >= 7) boost += 28 + 52;  
          else if (ex >= 5) boost += 28; 
          return boost;
        },
        // 復讐個数増加：+6個
        revengeCountBonus: 6
      },
      'ソフィ': {
        type: '海軍',
        partyDamageBoost: 20,  // 編成するだけでダメ増・ダメ減に各+20%（複数いても重複しない）
        awakeningCapable: true,
        shieldBuff: (ex) => 66 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex, ctx) => {
          // 異常特攻: 状態異常種類数 × 特攻倍率（アイリス/ミーク/マゼリアのいずれかと同時編成で1.3種）
          const team = (ctx && ctx.teamHeroes) || [];
          const hasAbnormalCombo = team.includes('アイリス') || team.includes('ミーク') || team.includes('マゼリア');
          const abnormalTypes = hasAbnormalCombo ? 1.3 : 0.4;
          const abnormalBonus = (ex >= 7 ? 25 : ex >= 5 ? 15 : 10) * Math.min(abnormalTypes, 3);
          return 130 * exclusiveMultipliers[ex] + abnormalBonus;
        },
        asBullets: (ex) => ex >= 7 ? 5 : 3,
        // PS脆弱付与（PS属性：ASの発動率・再発動ロジックには干渉しない）
        // 専5以上：脆弱20% × 3個 ／ 専5未満：脆弱15% × 2個、発動確率50%
        // ダメージ量は計算エンジンが「平均の直接1発」から算出する（破凱・マゼリアと同じ脆弱ロジック）
        psVulnerableValue: (ex) => ex >= 5 ? 20 : 15,
        psVulnerableCount: (ex) => ex >= 5 ? 3 : 2,
        psVulnerableLossCoef: 0.98,
        psVulnerableTriggerRate: 50 / 100,
        // ===== 覚醒スキル =====
        // プロパティの意味はミヤの定義コメントを参照（このファイル内で共通の設計）。
        // ctx = { teamHeroes: [同時編成の英雄名...], speedCondition: '同攻速'|'攻速勝ち'|'攻速負け' }
        awakening: {
          // スキル1：開戦シールド加算（ランク1以上）＋ ASダメージ加算（ランク6以上）
          // （この英雄専用の定義。他英雄とは共有しない）
          shieldBonus: (ranks, exLv) => {
            if (!ranks.skill1 || ranks.skill1 <= 0) return 0;
            const table = [1, 2, 3, 4.5, 6, 8, 10, 13, 16, 20]; // index: rank-1
            let v = table[ranks.skill1 - 1] || 0;
            if (exLv >= 7) v *= 1.5;
            return v;
          },

          // スキル2：確率でAS弾数+1（ランク1以上）＋ 磁気燃焼ダメージ軽減（ランク6以上）
          // ・確率(%)はランク依存、専7以上で1.5倍。「+1発 × 確率」の期待値をAS弾数に加算する。
          //   例：ランク10・専6以下 → +0.6発 ／ ランク10・専7以上 → +0.9発
          asBulletsBonus: (ranks, exLv) => {
            if (!ranks.skill2 || ranks.skill2 <= 0) return 0;
            const rateTable = [3, 6, 9, 13.5, 18, 24, 30, 39, 48, 60]; // %、index: rank-1
            let rate = rateTable[ranks.skill2 - 1] || 0;
            if (exLv >= 7) rate *= 1.5;
            return Math.min(rate, 100) / 100;
          },
          // ・ミヤと同様の磁気燃焼ダメージ軽減（ランク6以上で解禁、専用倍率とは無関係）
          magneticBurningReduction: (ranks) => {
            const table = { 6: 3.75, 7: 7.5, 8: 11.25, 9: 17.5, 10: 25 };
            return table[ranks.skill2] || 0;
          },

          // スキル1(ランク6以上)・スキル3・スキル4：ASダメージ加算（すべて期待値で返す）
          asDamageBonus: (ranks, exLv, ctx) => {
            const team = (ctx && ctx.teamHeroes) || [];
            const exMul = exLv >= 7 ? 1.5 : 1;
            let total = 0;

            // スキル1：ランク6以上で解禁
            const s1Table = { 6: 1.5, 7: 3, 8: 4.5, 9: 7, 10: 10 };
            total += s1Table[ranks.skill1] || 0;

            // スキル3：アデルとマゼリアを同時編成している場合のみ。専7以上で1.5倍
            const s3Cond = team.includes('アデル') && team.includes('マゼリア');
            if (ranks.skill3 > 0 && s3Cond) {
              const s3Table = [0.75, 1.5, 2.25, 3.38, 4.5, 6, 7.5, 9.75, 12, 15]; // index: rank-1
              total += (s3Table[ranks.skill3 - 1] || 0) * exMul;
            }
            // スキル3：ランク6以上で追加の確率加算（適用確率35%の期待値。専用倍率は掛けない）
            //   ★アデルとマゼリアを同時編成している場合のみ有効
            if (s3Cond) {
              const s3ExtraTable = { 6: 3, 7: 6, 8: 9, 9: 14, 10: 20 };
              total += (s3ExtraTable[ranks.skill3] || 0) * 0.35;
            }

            // スキル4：アデル／ノーラ／ツバキのいずれかを同時編成している場合のみ。専7以上で1.5倍
            //   適用確率は攻速関係で変動：同攻速=(3/9)/2、高速勝ち=3/9、高速負け=0/9
            if (ranks.skill4 > 0 && (team.includes('アデル') || team.includes('ノーラ') || team.includes('ツバキ'))) {
              const s4Table = [2, 4, 6, 9, 12, 16, 20, 26, 32, 40]; // index: rank-1
              const speedRate = { '同攻速': (3 / 9) / 2, '攻速勝ち': 3 / 9, '攻速負け': 0 };
              const m = ctx && ctx.speedCondition;
              const rate = speedRate[m] !== undefined ? speedRate[m] : speedRate['同攻速'];
              total += (s4Table[ranks.skill4 - 1] || 0) * exMul * rate;
            }
            // スキル4：ランク6以上で追加の確率加算（90%の期待値。専用倍率は掛けない）
            const s4ExtraTable = { 6: 3, 7: 6, 8: 9, 9: 14, 10: 20 };
            total += (s4ExtraTable[ranks.skill4] || 0) * 0.9;

            return total;
          }
        }
      },
      'ヒヨリ': {
        type: '海軍',
        shieldBuff: (ex) => 65 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex) => {
          const abnormalBonus = ex >= 7 ? 50 : ex >= 5 ? 30 : 10;
          return 130 * exclusiveMultipliers[ex] + abnormalBonus;
        },
        asBullets: (ex) => ex >= 7 ? 5 : 3,
        // PS脆弱付与（PS属性：ASの発動率・再発動ロジックには干渉しない）
        // 脆弱値は専用レベルによらず15%。付与数は専5以上で3個、専5未満で2個、発動確率50%
        // ダメージ量は計算エンジンが「平均の直接1発」から算出する（破凱・マゼリアと同じ脆弱ロジック）
        psVulnerableValue: 15,
        psVulnerableCount: (ex) => ex >= 5 ? 3 : 2,
        psVulnerableLossCoef: 0.98,
        psVulnerableTriggerRate: 50 / 100
      },
      'ミーク': {
        type: '海軍',
        ironWallValue: (ex) => (ex >= 7 ? 50 : 40) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        asRate: 35,
        asDamage: (ex) => (ex >= 5 ? 115 : 90) * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 7 ? 4.5 : 3,
        // AS衰弱効果
        asDebuff: (ex, hasRush, silenceCount) => {
          const actualRate = 35 * (9 - silenceCount) / 9 / 100;
          const baseRate = 35 / 100;
          const baseDebuffRate = ex >= 7 ? (hasRush ? 86.3 : 81.4) : (hasRush ? 80.3 : 69.8);
          const adjustedRate = baseDebuffRate * Math.sqrt(actualRate / baseRate) / 100;
          return { value: 15 * exclusiveMultipliers[ex], rate: adjustedRate };
        },
        // AS重甲付与
        asArmor: { count: 1.5, value: 15 },
        // 重甲率補填・軽甲率補填
        heavyArmorRateComplement: 0.2,
        lightArmorRateComplement: 0.2
      },
      'マゼリア': {
        type: '海軍',
        ironWallValue: (ex) => (ex >= 7 ? 50 : 40) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        asRate: 35,
        asDamage: (ex) => 110 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 7 ? 5 : 3,
        // AS衰弱効果（専7水準固定）
        asDebuff: (ex, hasRush, silenceCount) => {
          const actualRate = 35 * (9 - silenceCount) / 9 / 100;
          const baseRate = 35 / 100;
          const baseDebuffRate = hasRush ? 86.3 : 81.4;
          const adjustedRate = baseDebuffRate * Math.sqrt(actualRate / baseRate) / 100;
          return { value: (ex >= 5 ? 30 : 15) * exclusiveMultipliers[ex], rate: adjustedRate };
        },
        // AS脆弱付与：脆弱15を4.5発（期待値）
        asVulnerable: { value: 15, count: 4.5, lossCoef: 0.85 }
      },
      'アイリス': {
        type: '海軍',
        ironWallValue: (ex) => (ex >= 7 ? 50 : 40) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        asRate: 35,
        asDamage: (ex) => 95 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 7 ? 5 : 3,
        // AS衰弱効果
        asDebuff: (ex, hasRush, silenceCount) => {
          const actualRate = 35 * (9 - silenceCount) / 9 / 100;
          const baseRate = 35 / 100;
          const baseDebuffRate = ex >= 5 ? (hasRush ? 86.3 : 81.4) : (hasRush ? 80.3 : 69.8);
          // 四乗根で調整（√√）
          const adjustedRate = baseDebuffRate * Math.pow(actualRate / baseRate, 0.25) / 100;
          return { value: 15 * exclusiveMultipliers[ex], rate: adjustedRate };
        },
        // AS重甲付与
        asArmor: { count: 3, value: 15 },
        // 重甲率補填・軽甲率補填
        heavyArmorRateComplement: 0.4,
        lightArmorRateComplement: 0.4
      },
      'デスコ': {
        type: '海軍',
        ironWallValue: (ex) => (36) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        // 鉄壁補正係数の下方修正：(1-40%の場合の鉄壁値×専用) / (1-当英雄の鉄壁値×専用)
        ironWallCorrectionAdjustment: (ex) => {
          // 専7以上の場合、standard40Valueも+10する
          const standard40Value = (40 + (ex >= 7 ? 10 : 0)) * exclusiveMultipliers[ex];
          const descoValue = (36) * exclusiveMultipliers[ex];
          return (1 - standard40Value / 100) / (1 - descoValue / 100);
        },
        asRate: 36,
        asDamage: (ex) => {
          const base = 80 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 30 : ex >= 5 ? base + 15 : base;
        },
        asBullets: (ex) =>  ex >= 7 ? 6 : 4,
        // 衰弱効果：衰弱値15%、衰弱率はミーク比較の憶測値
        asDebuff: (ex, hasRush, silenceCount) => {
          const actualRate = 36 * (9 - silenceCount) / 9 / 100;
          const baseRate = 36 / 100;
          const baseDebuffRate = ex >= 7 ? (hasRush ? 82 : 76) : (hasRush ? 72 : 66);
          const adjustedRate = baseDebuffRate * Math.sqrt(actualRate / baseRate) / 100;
          return { value: 15 * exclusiveMultipliers[ex], rate: adjustedRate };
        },      
      },
      'レイチェル': {
        type: '海軍',
        attackBuff: (ex) => 110 * exclusiveMultipliers[ex],
        // PS収束：被ダメ減シールド種類数 × 35%（専7で70%）のダメ増加算
        shieldTypesDamageBoost: (ex) => ex >= 5 ? 70 : 35,
        // PS重甲：2枚固定
        psArmor: { value: 50, count: 2 },
        // ダメ減加算：75%
        damageReductionAddition: 75,
        // 拡散弾数ボーナス：拡散を持つ英雄の弾数+1
        scatterBulletBonus: 1,
        // 拡散ダメ加算：専5以上で+16%、専7でさらに+30%
        scatterDamageBoost: (ex) => {
          if (ex >= 7) return 16 + 30; // 46
          if (ex >= 5) return 16;
          return 0;
        },
        // 専7以上：全重甲枚数×1.15、種類数+0.12ずつ
        armorMultiplier: (ex) => ex >= 7 ? 1.15 : 1.0,
        // 重甲率：固定0.6、専7以上は重甲率補填+0.12
        heavyArmorRate: 0.6,
        heavyArmorRateComplement: (ex) => ex >= 7 ? 0.12 : 0
      },
      'マリナ': {
        type: '海軍',
        attackBuff: (ex) => 105 * exclusiveMultipliers[ex],
        // PS収束：被ダメ減シールド種類数 × 30%（専7で60%）のダメ増加算
        shieldTypesDamageBoost: (ex) => ex >= 7 ? 60 : 30,
        // PS重甲：1枚（専5で+1）
        psArmor: (ex) => ({ value: 50, count: ex >= 5 ? 2 : 1 }),
        // ダメ減加算：75%
        damageReductionAddition: 75,
        // 拡散弾数ボーナス：専5以上で拡散を持つ英雄の弾数+1
        scatterBulletBonus: (ex) => ex >= 5 ? 1 : 0,
        // 拡散ダメ加算：専7以上で+30%
        scatterDamageBoost: (ex) => ex >= 7 ? 30 : 0,
        // 重甲率：専5以上で0.6、専5未満で0.4
        heavyArmorRate: (ex) => ex >= 5 ? 0.6 : 0.4
      },
      'コレット': {
        type: '海軍',
        shieldBuff: (ex) => 70 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex) => 90 * exclusiveMultipliers[ex],
        asBullets: 3,
        // 拡散ダメ：ASの1発ごとに発動、基礎ダメージ(baseDamage=40%、絶対値) × 拡散補正 × 弾数
        scatterDamage: {
          baseDamage: 40,
          baseBullets: 2,
          // 専5以上：種類数に応じた追加弾数（合計テーブル[0,1,2,3,4]→[2,2,2,5,6]からbaseBullets=2を引いた追加分）
          conditionalBullets: (ex, shieldTypes) => {
            if (ex < 5) return 0;
            const table = { 0: 0, 1: 0, 2: 0, 3: 3, 4: 4 };
            const keys = [0, 1, 2, 3, 4];
            if (table[shieldTypes] !== undefined) return table[shieldTypes];
            const lower = keys.filter(k => k < shieldTypes).pop();
            const upper = keys.find(k => k > shieldTypes);
            if (lower === undefined) return table[keys[0]];
            if (upper === undefined) return table[keys[keys.length - 1]];
            const ratio = (shieldTypes - lower) / (upper - lower);
            return table[lower] + ratio * (table[upper] - table[lower]);
          }
        },
        // 被ダメ減シールド種類数 × 20%（専7で60%）の拡散ダメ加算
        shieldTypesScatterBoost: (ex) => ex >= 7 ? 60 : 20,
        // PS：被ダメ減シールド種類数 × 15%（専7で60%）のダメ減加算
        shieldTypesDamageReductionBoost: (ex) => ex >= 7 ? 60 : 15,
        // 軽甲率：専5以上で0.6、専5未満で0.4
        lightArmorRate: (ex) => ex >= 5 ? 0.6 : 0.4
      },
      'ピスカ': {
        type: '海軍',
        awakeningCapable: true,
        openingShield: (ex) => 72 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex) => 95 * exclusiveMultipliers[ex],
        asBullets: 3,
        // 拡散ダメ：ASの1発ごとに発動、基礎ダメージ(baseDamage=40%、絶対値) × 拡散補正 × 弾数
        scatterDamage: {
          baseDamage: 40,
          baseBullets: 2,
          // 種類数[0,1,2,3,4]に応じた追加拡散弾数：専7未満[0,0,1,2,3]、専7以上[0,0,1,4,5]
          conditionalBullets: (ex, shieldTypes) => {
            const table = ex >= 7
              ? { 0: 0, 1: 0, 2: 1, 3: 4, 4: 5 }
              : { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3 };
            const keys = [0, 1, 2, 3, 4];
            if (table[shieldTypes] !== undefined) return table[shieldTypes];
            const lower = keys.filter(k => k < shieldTypes).pop();
            const upper = keys.find(k => k > shieldTypes);
            if (lower === undefined) return table[keys[0]];
            if (upper === undefined) return table[keys[keys.length - 1]];
            const ratio = (shieldTypes - lower) / (upper - lower);
            return table[lower] + ratio * (table[upper] - table[lower]);
          }
        },
        // 被ダメ減シールド種類数 × 20%（専7で60%）の拡散ダメ加算
        shieldTypesScatterBoost: (ex) => ex >= 7 ? 60 : 20,
        // PS：被ダメ減シールド種類数 × 15%（専5以上で60%）のダメ減加算
        shieldTypesDamageReductionBoost: (ex) => ex >= 5 ? 60 : 15,
        // 軽甲率：専5以上で0.6、専5未満で0.4
        lightArmorRate: (ex) => ex >= 5 ? 0.6 : 0.4,
        // ===== 覚醒スキル =====
        // スキル1：開戦シールド加算（ランク1以上）＋ ASダメージ加算（ランク6以上）
        // （この英雄専用の定義。他英雄とは共有しない）
        awakening: {
          shieldBonus: (ranks, exLv) => {
          if (!ranks.skill1 || ranks.skill1 <= 0) return 0;
          const table = [1, 2, 3, 4.5, 6, 8, 10, 13, 16, 20]; // index: rank-1
          let v = table[ranks.skill1 - 1] || 0;
          if (exLv >= 7) v *= 1.5;
          return v;
        },
          // スキル1(ランク6以上)・スキル4(ランク6以上)：ASダメージ加算（すべて期待値で返す）
          asDamageBonus: (ranks, exLv, ctx) => {
            let total = 0;
            const s1Table = { 6: 1.5, 7: 3, 8: 4.5, 9: 7, 10: 10 };
            total += s1Table[ranks.skill1] || 0;
            // スキル4：ランク6〜10で、攻速条件によって確率が変わるASダメージ加算（専用倍率なし）
            //   確率：攻速勝ち=100% / 同攻速=82% / 攻速負け=76%（ctx未指定は同攻速扱い）
            const s4Table = { 6: 2.25, 7: 4.5, 8: 6.75, 9: 10.5, 10: 15 };
            const prob = { '攻速勝ち': 1.0, '同攻速': 0.82, '攻速負け': 0.76 };
            const m = ctx && ctx.speedCondition;
            const p = prob[m] !== undefined ? prob[m] : prob['同攻速'];
            total += (s4Table[ranks.skill4] || 0) * p;
            return total;
          },

          // 拡散ダメージの baseDamage（%）への加算。専用倍率ありのものは専7以上で1.5倍
          //   スキル2：ランク1以上
          //   スキル3：マリナとアイリスを同時編成している場合のみ
          //   スキル4：ランク1以上
          scatterBaseDamageBonus: (ranks, exLv, ctx) => {
            const team = (ctx && ctx.teamHeroes) || [];
            const exMul = exLv >= 7 ? 1.5 : 1;
            let total = 0;
            if (ranks.skill2 > 0) {
              const t = [0.5, 1, 1.5, 2.25, 3, 4, 5, 6.5, 8, 10]; // index: rank-1
              total += (t[ranks.skill2 - 1] || 0) * exMul;
            }
            if (ranks.skill3 > 0 && team.includes('マリナ') && team.includes('アイリス')) {
              const t = [0.6, 1.2, 1.8, 2.7, 3.6, 4.8, 6, 7.8, 9.6, 12]; // index: rank-1
              total += (t[ranks.skill3 - 1] || 0) * exMul;
            }
            if (ranks.skill4 > 0) {
              const t = [0.75, 1.5, 2.25, 3.38, 4.5, 6, 7.5, 9.75, 12, 15]; // index: rank-1
              total += (t[ranks.skill4 - 1] || 0) * exMul;
            }
            return total;
          },
          // 拡散弾数の加算（期待値）：スキル2・スキル3のランク6〜10で、確率で+1（専用倍率なし）
          //   スキル2とスキル3は別々に判定されるので、期待値は両方を足す
          //   ★スキル3分は、マリナとアイリスを同時編成している場合のみ有効（スキル2は条件なし）
          scatterBulletsBonus: (ranks, exLv, ctx) => {
            const team = (ctx && ctx.teamHeroes) || [];
            const rateTable = { 6: 9, 7: 18, 8: 27, 9: 42, 10: 60 }; // %
            const s3Active = team.includes('マリナ') && team.includes('アイリス');
            return ((rateTable[ranks.skill2] || 0) + (s3Active ? (rateTable[ranks.skill3] || 0) : 0)) / 100;
          },

          // スキル4：被沈黙数の減少（ランク6以上で有効。ランクによる数値変動なし）
          //   基礎減少割合30%（被沈黙数 ×0.7）が、攻速条件ごとの確率で発動する。
          //   戻り値は「減少割合の期待値」＝確率 × 0.3（0〜1）。エンジンは 被沈黙数 × (1 − 戻り値) として適用する。
          //   確率：攻速勝ち=100% / 同攻速=80% / 攻速負け=60%（ctx未指定は同攻速扱い）
          silenceReduction: (ranks, exLv, ctx) => {
            if (!ranks.skill4 || ranks.skill4 < 6) return 0;
            const prob = { '攻速勝ち': 1.0, '同攻速': 0.8, '攻速負け': 0.6 };
            const m = ctx && ctx.speedCondition;
            const p = prob[m] !== undefined ? prob[m] : prob['同攻速'];
            return 0.3 * p;
          }
        }
      },
      'ルーシィ': {
        type: '海軍',
        shieldBuff: (ex) => 65 * exclusiveMultipliers[ex],
        asRate: 34,
        asDamage: (ex) => {
          const base = 80 * exclusiveMultipliers[ex];
          const bonus = ex >= 7 ? 90 : 0;
          return base + bonus;
        },
        asBullets: 3,
        // 拡散ダメ：ASの1発ごとに発動、ASダメ × 30% × 拡散補正 × 2発
        scatterDamage: {
          baseDamage: 30,
          baseBullets: 2
        },
        // 被ダメ減シールド種類数 × 20%（専5で50%）の拡散ダメ加算
        shieldTypesScatterBoost: (ex) => ex >= 5 ? 50 : 20,
        // PS：被ダメ減シールド種類数 × 10%（専7で30%）のダメ減加算
        shieldTypesDamageReductionBoost: (ex) => ex >= 7 ? 30 : 10,
        // 軽甲率：専5以上で0.4、専5未満で0
        lightArmorRate: (ex) => ex >= 5 ? 0.4 : 0
      },
      'スターフ': {
        type: '海軍',
        // 軽甲率：固定0.6
        lightArmorRate: 0.6
      },
      'リヴィア': {
        type: '空軍',
        attackBuff: (ex) => {
          const base = 135 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 30 : base;
        },
        // 開幕スキル：ラウンドごと（11.1%発動率）30%（専5以上で120%）の燃焼を1発（専5以上で3発）
        openingBurning: (ex) => {
          const rate = 0.111;
          if (ex >= 5) return { value: 120, count: 3, rate };
          return { value: 30, count: 1, rate };
        },
        // PS燃焼：ミスティ/アスカと同時編成では発動しない
        psBurning: (ex, ctx) => {
          const team = (ctx && ctx.teamHeroes) || [];
          if (team.includes('ミスティ') || team.includes('アスカ')) return null;
          if (!ctx || ctx.speedCondition !== '同攻速') return null;
          const rate = ex >= 5 ? 0.90 : 0.85;
          const value = ex >= 5 ? 120 : 30;
          return { rate, value, count: 1 };
        },
        // PSダメ増バフ：ミスティ/アスカと同時編成では発動しない
        psDamageIncreasePerRound: (ex, ctx) => {
          const team = (ctx && ctx.teamHeroes) || [];
          const speedCondition = ctx && ctx.speedCondition;
          if (team.includes('ミスティ') || team.includes('アスカ')) return null;
          
          let baseValues;
          if (ex >= 7) baseValues = [100, 275, 300, 300];
          else if (ex >= 5) baseValues = [34, 104, 174, 250];
          else baseValues = [24, 94, 164, 240];
          
          if (speedCondition === '攻速負け') return [0, 0, 0, 0];
          if (speedCondition === '攻速勝ち') {
            // R1～R3は0.8倍、R4はそのまま
            return [baseValues[0] * 0.8, baseValues[1] * 0.8, baseValues[2] * 0.8, baseValues[3]];
          }
          // 同攻速
          return baseValues;
        }
      },
      'リヴィア（神秘）': {
        type: '空軍',
        attackBuff: (ex) => {
          const base = 135 * exclusiveMultipliers[ex];
          if (ex >= 7) return base + 32;  // 専7: +32（リヴィアは+30）
          return base;
        },
        // 開幕スキル：専0-4で3発に増加、専5以上は変更なし
        openingBurning: (ex) => {
          const rate = 0.111;
          if (ex >= 7) return { value: 130, count: 3, rate };  // 専7: 130%
          if (ex >= 5) return { value: 120, count: 3, rate };  // 専5-6: 120%
          return { value: 30, count: 3, rate };  // 専0-4: 30% × 3発（リヴィアは1発）
        },
        // PS燃焼：ミスティ/アスカと同時編成では発動しない
        psBurning: (ex, ctx) => {
          const team = (ctx && ctx.teamHeroes) || [];
          if (team.includes('ミスティ') || team.includes('アスカ')) return null;
          if (!ctx || ctx.speedCondition !== '同攻速') return null;
          const rate = ex >= 5 ? 0.90 : 0.85;
          const value = ex >= 7 ? 130 : (ex >= 5 ? 120 : 30);  // 専7: 130%
          return { rate, value, count: 1 };
        },
        // PSダメ増バフ：専5以上でリヴィア専7相当
        psDamageIncreasePerRound: (ex, ctx) => {
          const team = (ctx && ctx.teamHeroes) || [];
          const speedCondition = ctx && ctx.speedCondition;
          if (team.includes('ミスティ') || team.includes('アスカ')) return null;
          
          let baseValues;
          if (ex >= 5) baseValues = [100, 275, 300, 300];  // 専5以上：リヴィア専7相当
          else baseValues = [24, 94, 164, 240];  // 専0-4：リヴィアと同じ
          
          if (speedCondition === '攻速負け') return [0, 0, 0, 0];
          if (speedCondition === '攻速勝ち') {
            // R1～R3は0.8倍、R4はそのまま
            return [baseValues[0] * 0.8, baseValues[1] * 0.8, baseValues[2] * 0.8, baseValues[3]];
          }
          // 同攻速
          return baseValues;
        }
      },
      'ルチル': {
        type: '空軍',
        awakeningCapable: true,
        shieldBuff: (ex) => 78 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex) => {
          const base = 50 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 56 : base;
        },
        asBullets: 9,
        // AS付随燃焼：30%燃焼×3発
        asBurning: { value: 30, count: 3 },
        // PS燃焼強化：グローバル効果、ラウンドごと
        // リヴィア/ユズハ/ノルシュ/リヴィア（神秘）との同時編成時に完全な値を返す
        psBurningBoostPerRound: (ex, ctx) => {
          const team = (ctx && ctx.teamHeroes) || [];
          const hasRivvia = team.includes('リヴィア');
          const hasYuzuha = team.includes('ユズハ');
          const hasNorshu = team.includes('ノルシュ');
          const hasNewRivvia = team.includes('リヴィア（神秘）');
          const base = [0, 10, 15, 15];
          if (ex >= 5) {
            const boosted = base.map(v => v * 4);
            // リヴィア/ユズハ/ノルシュ/リヴィア（神秘）との同時編成時は完全な値
            if (hasRivvia || hasYuzuha || hasNorshu || hasNewRivvia) {
              return boosted;
            }
            return boosted;
          }
          return base;
        },
        // 専7以上：グローバル燃焼強化+40%
        burningBoost: (ex) => ex >= 7 ? 40 : 0,
        // ===== 覚醒スキル =====
        // プロパティの意味はミヤの定義コメントを参照（このファイル内で共通の設計）。
        awakening: {
          // スキル1：開戦シールド加算（ランク1以上）＋ ASダメージ加算（ランク6以上）
          // （この英雄専用の定義。他英雄とは共有しない）
          shieldBonus: (ranks, exLv) => {
          if (!ranks.skill1 || ranks.skill1 <= 0) return 0;
          const table = [1, 2, 3, 4.5, 6, 8, 10, 13, 16, 20]; // index: rank-1
          let v = table[ranks.skill1 - 1] || 0;
          if (exLv >= 7) v *= 1.5;
          return v;
        },
          // スキル1(ランク6以上)・スキル2：ASダメージ加算（すべて期待値で返す）
          asDamageBonus: (ranks, exLv, ctx) => {
            const exMul = exLv >= 7 ? 1.5 : 1;
            let total = 0;

            // スキル1：ランク6以上で解禁
            const s1Table = { 6: 1.5, 7: 3, 8: 4.5, 9: 7, 10: 10 };
            total += s1Table[ranks.skill1] || 0;

            // スキル2：攻速条件で変化する加算。基準値×専用倍率(専7以上1.5倍)×攻速係数
            //   攻速係数：攻速勝ち=9 / 同攻速=8 / 攻速負け=5.5（ctx未指定は同攻速扱い）
            if (ranks.skill2 > 0) {
              const s2Table = [0.2, 0.4, 0.6, 0.9, 1.2, 1.6, 2.0, 2.6, 3.2, 4]; // index: rank-1
              const speedMul = { '攻速勝ち': 9, '同攻速': 8, '攻速負け': 5.5 };
              const m = ctx && ctx.speedCondition;
              const mul = speedMul[m] !== undefined ? speedMul[m] : speedMul['同攻速'];
              total += (s2Table[ranks.skill2 - 1] || 0) * exMul * mul;
            }
            // スキル2：ランク6以上で追加の確率加算（適用確率35%の期待値。専用倍率は掛けない）
            const s2ExtraTable = { 6: 6, 7: 12, 8: 18, 9: 28, 10: 40 };
            total += (s2ExtraTable[ranks.skill2] || 0) * 0.35;

            return total;
          },

          // スキル3：条件付きグローバル燃焼効果強化（全英雄の燃焼に掛かる加算、%）
          // ★発動条件：リヴィア（神秘）とノルシュを同時編成していること。専7以上で1.5倍
          globalBurningBoost: (ranks, exLv, ctx) => {
            if (!ranks.skill3 || ranks.skill3 <= 0) return 0;
            const team = (ctx && ctx.teamHeroes) || [];
            if (!(team.includes('リヴィア（神秘）') && team.includes('ノルシュ'))) return 0;
            const table = [0.75, 1.5, 2.25, 3.38, 4.5, 6, 7.5, 9.75, 12, 15]; // index: rank-1
            let v = table[ranks.skill3 - 1] || 0;
            if (exLv >= 7) v *= 1.5;
            return v;
          },

          // スキル4：パッシブ直接ダメージ（PS側。1ラウンドに1回の効果なので発動率 1/9）
          //   1発あたり：基準値×専用倍率(専7以上1.5倍)。弾数は攻速条件で変化：勝ち=0発 / 同攻速=8.2発 / 負け=9発
          //   ※基準値は10ランク分（ミヤのスキル4と同じ並び）。要確認：依頼文は11個の値だった
          passiveDirects: (ranks, exLv, ctx) => {
            if (!ranks.skill4 || ranks.skill4 <= 0) return [];
            const table = [2, 4, 6, 9, 12, 16, 20, 26, 32, 40]; // index: rank-1
            const shots = { '攻速勝ち': 0, '同攻速': 8.2, '攻速負け': 9 };
            const m = ctx && ctx.speedCondition;
            const count = shots[m] !== undefined ? shots[m] : shots['同攻速'];
            const exMul = exLv >= 7 ? 1.5 : 1;
            return [{ value: (table[ranks.skill4 - 1] || 0) * exMul, count: count, rate: 1 / 9, skill: 4 }];
          },
          // スキル4：ランク6以上で解禁するAS付随直接ダメージ（AS発動のたびに100%効果。専用倍率なし）
          //   ダメージ値はランク依存、弾数は 0.5×3 = 1.5発。ASダメージ%ではなく絶対値扱い（ノーラ等のAS倍率は掛けない）
          attachedDirects: (ranks) => {
            const table = { 6: 7.5, 7: 15, 8: 22.5, 9: 35, 10: 50 };
            const v = table[ranks.skill4];
            return v === undefined ? [] : [{ value: v, count: 0.5 * 3, skill: 4 }];
          },

          // スキル3：条件付きグローバル燃焼強化（上記 globalBurningBoost）＋ スキル再発動
          // ★どちらも「リヴィア（神秘）とノルシュを同時編成」している場合のみ有効
          // ・再発動はランク6以上で解禁（reactivation 内のテーブルに行があるランクのみ有効）。
          // ・再発動ダメージ割合はランク依存。確率は60%固定。
          // ・AS付随効果（AS付随燃焼など）はダメージ割合の影響を受けず、常に100%効果で再発動する。
          reactivation: (ranks, exLv, ctx) => {
            // ★ランク6以上の再発動も、リヴィア（神秘） と ノルシュ を同時編成している場合のみ有効
            const team = (ctx && ctx.teamHeroes) || [];
            if (!(team.includes('リヴィア（神秘）') && team.includes('ノルシュ'))) return null;
            // ランク6以上で解禁（テーブルに無いランクは再発動なし）
            const damageTable = { 6: 7.5, 7: 15, 8: 22.5, 9: 35, 10: 50 };
            const damageRatio = damageTable[ranks.skill3];
            if (damageRatio === undefined) return null;
            return {
              condition: 'ironWallActive',
              triggerRate: 60, // 再発動確率(%)：60%固定
              damageRatio: damageRatio,
              reactivateAsEffects: true
            };
          }
        }
      },
      'ノルシュ': {
        type: '空軍',
        ironWallValue: (ex) => (40 + (ex >= 7 ? 10 : 0)) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        asRate: 34,
        asDamage: (ex) => {
          const base = 107 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 100 : base;
        },
        asBullets: (ex) => ex >= 7 ? 4 : 3,
        // AS付随燃焼：15%燃焼を2.6体に
        asBurning: { value: 15, count: 2.6 },
        // 鼓動効果：35%×2ラウンド（専5以上）
        heartbeat: (ex) => ex >= 5 ? { value: 35, rounds: 2 } : null
      },
      'ストームシャドー': {
        type: '空軍',
        ironWallValue: (ex) => (40 + (ex >= 7 ? 10 : 0)) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        asRate: 36,
        asDamage: (ex) => 155 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 7 ? 4 : 2,
        // 鼓動効果：25%×3ラウンド
        heartbeat: { value: 25, rounds: 3 },
        // 開幕燃焼：専5以上で50%×3発
        openingBurning: (ex) => ex >= 5 ? { value: 50, count: 3, rate: 0.111 } : null
      },
      'フローリア': {
        type: '空軍',
        ironWallValue: (ex) => (40 + (ex >= 7 ? 10 : 0)) * exclusiveMultipliers[ex],
        ironWallRounds: (ex) => ex >= 5 ? 2 : 1,
        asRate: 35,
        asDamage: (ex) => {
          const base = 160 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 80 : base;
        },
        asBullets: 3,
        // 鼓動効果：30%×3ラウンド
        heartbeat: { value: 30, rounds: 3 },
        // PS連撃強化：専5以上でグローバル効果
        comboBoost: (ex) => ex >= 5 ? 30 : 0
      },
      'ユズハ': {
        type: '空軍',
        attackBuff: (ex) => {
          const base = 125 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 22 : base;
        },
        // 開幕スキル（専5以上）：ラウンドごと（11.1%発動率）50%燃焼×3
        openingBurning: (ex) => ex >= 5 ? { value: 50, count: 3, rate: 0.111 } : null,
        // 挑発効果（R1とR2のみ有効）
        taunt: (ex, ctx) => {
          const team = (ctx && ctx.teamHeroes) || [];
          const hasMisty = team.includes('ミスティ');
          const hasAsuka = team.includes('アスカ');
          if (!ctx || ctx.speedCondition !== '同攻速') return null;
          let tauntCount = 6;
          if (ex >= 7) tauntCount = 18;
          else if (ex >= 5) tauntCount = 9;
          
          // 燃焼付与数の倍率
          let burningMultiplier = 1.0;
          if (hasMisty && hasAsuka) burningMultiplier = 1.21 * 1.12;
          else if (hasMisty) burningMultiplier = 1.21;
          else if (hasAsuka) burningMultiplier = 1.12;
          
          return {
            count: tauntCount,
            burningValue: 48,
            burningCount: 1 * burningMultiplier,
            rate: 0.111 // ラウンドごと（9ターンに1度）
          };
        },
        // ダメ増バフ：[R1, R2-R4]
        damageIncreasePerRound: (ex) => {
          if (ex >= 7) return [100, 200];
          if (ex >= 5) return [50, 100];
          return [36.5, 73];
        }
      },
      'アスカ': {
        isMagneticHero: true,  // 磁気英雄の同時編成数カウント（アカネのAS拡散計算用）
        type: '汎用',
        attackBuff: (ex) => 40 * exclusiveMultipliers[ex] * (2/3) * 1.1,
        shieldBuff: (ex) => {
          const base = 55 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 40 : base;
        },
        asRate: 42,
        asDamage: 50,
        asBullets: 6,
        // 専5以上：ラウンドごと（11.1%発動率）50%燃焼×2発
        psBurning: (ex) => ex >= 5 ? { value: 50, count: 2, rate: 0.111 } : null,
        // 磁気と燃焼の効果強化
        magneticBoost: (ex) => ex >= 7 ? 15 : ex >= 5 ? 10 : 0,
        burningBoost: (ex) => ex >= 7 ? 15 : ex >= 5 ? 10 : 0
      },
      'ミスティ': {
        type: '空軍',
        openingShield: (ex) => 75 * exclusiveMultipliers[ex],
        asRate: 34,
        asDamage: (ex) => {
          const base = 45 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 30 : base;
        },
        asBullets: 9,
        // AS付随燃焼：30%燃焼を3発（ユズハやノルシュと同時編成時は8発）
        asBurning: (ctx) => {
          const team = (ctx && ctx.teamHeroes) || [];
          const count = (team.includes('ユズハ') || team.includes('ノルシュ')) ? 8 : 3;
          return { value: 30, count: count };
        },
        // PS開幕燃焼：11.11%の確率で50%燃焼を3発
        openingBurning: { value: 50, count: 3, rate: 0.111 },
        // PS燃焼強化：専5以上で10%、専7以上で40%
        burningBoost: (ex) => {
          if (ex >= 7) return 40;
          if (ex >= 5) return 10;
          return 0;
        }
      },
      'ギャビー': {
        type: '空軍',
        attackBuff: (ex) => {
          const base = 125 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 52 : base;
        },
        // 連撃ダメ強化（グローバル効果）
        comboBoost: (ex) => {
          let boost = 59;
          if (ex >= 7) boost += 69 + 60;  // 59 + 129 = 188
          else if (ex >= 5) boost += 69;   // 59 + 69 = 128
          return boost;
        },
        // 鼓動効果：30% × 3ラウンド
        heartbeat: { value: 30, rounds: 3 }
      },
      'ビスコット': {
        type: '空軍',
        awakeningCapable: true,
        openingShield: (ex) => 73 * exclusiveMultipliers[ex],
        // 鼓動効果：15%（専7で+15%）× 3ラウンド
        heartbeat: (ex) => {
          const value = ex >= 7 ? 30 : 15;
          return { value: value, rounds: 3 };
        },
        // PS連撃：0.69 × 確率 × 回数
        psCombo: (ex) => {
          const triggerRate = ex >= 5 ? 1.0 : 0.5;
          const count = ex >= 7 ? 3 : 2;
          return { rate: 0.69 * triggerRate, count: count };
        },
        // PS連撃強化（ビスコットの連撃にのみ作用するローカル効果・累積型）
        //   累積基礎値：専5以上で10、専5未満で5。連撃回数に応じて calcCumulativeComboAverage で平均化される
        psComboCumulativeBase: (ex) => (ex >= 5 ? 10 : 5),
        // ===== 覚醒スキル =====
        awakening: {
          // スキル1：開戦シールド加算（ランク1以上）＋ ローカル連撃強化（ランク6以上）
          shieldBonus: (ranks, exLv) => {
            if (!ranks.skill1 || ranks.skill1 <= 0) return 0;
            const table = [1, 2, 3, 4.5, 6, 8, 10, 13, 16, 20]; // index: rank-1
            let v = table[ranks.skill1 - 1] || 0;
            if (exLv >= 7) v *= 1.5;
            return v;
          },
          // ローカル連撃強化（自身の連撃にのみ加算）
          //   スキル1：ランク6以上（専用倍率なし）
          //   スキル3：ギャビーとフローリアを同時編成（専7以上で1.5倍）
          comboLocalBoost: (ranks, exLv, ctx) => {
            const team = (ctx && ctx.teamHeroes) || [];
            let total = 0;
            const s1Table = { 6: 1.5, 7: 3, 8: 4.5, 9: 7, 10: 10 };
            total += s1Table[ranks.skill1] || 0;
            if (ranks.skill3 > 0 && team.includes('ギャビー') && team.includes('フローリア')) {
              const t = [0.5, 1, 1.5, 2.25, 3, 4, 5, 6.5, 8, 10]; // index: rank-1
              total += (t[ranks.skill3 - 1] || 0) * (exLv >= 7 ? 1.5 : 1);
            }
            return total;
          },

          // スキル2：連撃ダメージにだけ掛かる衰弱抵抗（ランク1以上）。確率60%、抵抗値は専7以上で1.5倍
          comboWeakenResist: (ranks, exLv) => {
            if (!ranks.skill2 || ranks.skill2 <= 0) return null;
            const t = [1.5, 3, 4.5, 6.75, 9, 12, 15, 19.5, 24, 30]; // index: rank-1
            return { prob: 0.6, resist: (t[ranks.skill2 - 1] || 0) * (exLv >= 7 ? 1.5 : 1) };
          },

          // 確率で連撃回数+1（期待値としてエンジンが加算。専用倍率なし）
          //   スキル2：ランク6〜10、条件なし
          //   スキル3：ランク6〜10、鉄壁が有効なラウンドのみ。★ギャビーとフローリアを同時編成している場合のみ有効
          comboCountBonus: (ranks, exLv, ctx) => {
            const team = (ctx && ctx.teamHeroes) || [];
            const list = [];
            const s2 = { 6: 12, 7: 15, 8: 19.5, 9: 24, 10: 30 };
            const s3 = { 6: 9, 7: 18, 8: 27, 9: 42, 10: 60 };
            if (s2[ranks.skill2]) list.push({ condition: 'always', triggerRate: s2[ranks.skill2], skill: 2 });
            if (s3[ranks.skill3] && team.includes('ギャビー') && team.includes('フローリア')) list.push({ condition: 'ironWallActive', triggerRate: s3[ranks.skill3], skill: 3 });
            return list;
          },

          // スキル4：PS連撃強化の累積基礎値への加算（ランク1以上、専7以上で1.5倍）
          comboCumulativeBaseBonus: (ranks, exLv) => {
            if (!ranks.skill4 || ranks.skill4 <= 0) return 0;
            const t = [0.4, 0.8, 1.2, 1.8, 2.4, 3.2, 4, 5.2, 6.4, 8]; // index: rank-1
            return (t[ranks.skill4 - 1] || 0) * (exLv >= 7 ? 1.5 : 1);
          },
          // スキル4：磁気燃焼ダメージ軽減（ランク6以上、ソフィなどと同じ値）
          magneticBurningReduction: (ranks) => {
            const table = { 6: 3.75, 7: 7.5, 8: 11.25, 9: 17.5, 10: 25 };
            return table[ranks.skill4] || 0;
          }
        }
      },
      'メイメイ': {
        type: '空軍',
        attackBuff: (ex) => {
          const base = 123 * exclusiveMultipliers[ex];
          return ex >= 7 ? base + 52 : base;
        },
        // 通常攻撃強化（個別効果）
        basicAttackBoost: (ex) => {
          let boost = 12;
          if (ex >= 7) boost += 33 + 55;  // 12 + 88 = 100
          else if (ex >= 5) boost += 33;   // 12 + 33 = 45
          return boost;
        },
        // ダメ増バフ加算（ラウンドごと）
        damageIncreaseAddition: (ex) => {
          if (ex >= 5) return [3.33, 16.66, 30, 30];
          return [3.33, 16.66, 20, 20];
        }
      },
      'アエラ': {
        type: '空軍',
        openingShield: (ex) => 68 * exclusiveMultipliers[ex],
        // 鼓動効果：10%（専5で+10%、専7でさらに+10%）× 3ラウンド
        heartbeat: (ex) => {
          let value = 10;
          if (ex >= 7) value += 10 + 10;  // 10 + 20 = 30
          else if (ex >= 5) value += 10;   // 10 + 10 = 20
          return { value: value, rounds: 3 };
        },
        // PS連撃：0.69 × 確率 × 回数
        psCombo: (ex) => {
          const triggerRate = ex >= 5 ? 1.0 : 0.8;
          const count = ex >= 7 ? 2.8 : 1.8;
          return { rate: 0.69 * triggerRate, count: count };
        }
      }
    };
