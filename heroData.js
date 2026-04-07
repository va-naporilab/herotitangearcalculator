// heroData.js
// 英雄データ定義ファイル
// 新英雄を追加する場合はこのファイルのみ編集すればOK

const exclusiveMultipliers = { 0: 1.0, 3: 1.1, 5: 1.21, 7: 1.34 };

const heroData = {
      '外す': {
        name: '外す',
        type: '汎用'
      },
      'ペトラ': {
        type: '陸軍',
        attackBuff: (ex) => 100 * exclusiveMultipliers[ex],
        magneticBoost: (ex) => ex >= 7 ? 120 : 70,
        asRate: 37,
        asDamage: (ex) => 60 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 5 ? 5 : 4,
        asExtraEffect: (ex, hasCombo) => hasCombo ? { damage: 50, bullets: (ex >= 5 ? 5 : 4) * 0.5 * 1.5, type: 'magnetic' } : null
      },
      '新ペトラ互換': {
        type: '陸軍',
        attackBuff: (ex) => 115 * exclusiveMultipliers[ex],
        magneticBoost: (ex) => {
          if (ex >= 5) return 120;  // 専5以上: +120%（専7でも同じ）
          return 70;                // 専4以下: +70%
        },
        asRate: 37,
        asDamage: (ex) => 70 * exclusiveMultipliers[ex],
        asBullets: (ex) => ex >= 7 ? 5 : 4,  // 専7以上で5発、それ以下で4発
        asExtraEffect: (ex, hasCombo) => hasCombo ? { damage: 50, bullets: (ex >= 7 ? 5 : 4) * 0.5 * 1.5, type: 'magnetic' } : null
      },
      'ミヤ': {
        type: '陸軍',
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
        psVulnerableValue: 30,
        psVulnerableCount: (ex) => ex >= 7 ? 4 : 3,
        psVulnerableLossCoef: 0.98,
        psVulnerableTriggerRate: 11.11 / 100,
        psVulnerableDamage: (ex) => {
          if (ex >= 7) return 40 + 265 + 200; // 505
          if (ex >= 5) return 40 + 180 + 139; // 359
          return 40 + 140 + 115; // 295
        },
        // グローバル効果
        globalDebuffBoost: (ex) => ex >= 5 ? 40 : 0,
        globalVulnerableBoost: (ex) => ex >= 5 ? 60 : 0,
        globalASDamageMultiplier: (ex) => ex >= 7 ? 1.12 : 1.0,
        specialHeroesASDamageMultiplier: (ex) => ex >= 7 ? 1.22 : 1.0,
        specialHeroes: ['ミーク', '新ミーク互換', 'アイリス', 'ソフィ', 'ヒヨリ']
      },
      '新ノーラ互換': {
        type: '海軍',
        attackBuff: (ex) => 110 * exclusiveMultipliers[ex],
        // 沈黙効果
        silenceCount: 3,
        // PSの衰弱付与（1ラウンドに1度）
        psDebuffValue: 30,
        psDebuffCount: (ex) => 4,
        psDebuffRate: (ex) => ex >= 5 ? 44.4 : 33.3,
        // PSの脆弱付与（1ラウンドに1度、確率11.11%）
        psVulnerableValue: (ex) => ex >= 7 ? 40 : 30,
        psVulnerableCount: (ex) => 4,
        psVulnerableLossCoef: 0.98,
        psVulnerableTriggerRate: 11.11 / 100,
        psVulnerableDamage: (ex) => {
          if (ex >= 7) return 40 + 265 + 200; // 505
          if (ex >= 5) return 40 + 180 + 139; // 359
          return 40 + 140 + 115; // 295
        },
        // グローバル効果
        globalDebuffBoost: (ex) => ex >= 5 ? 40 : 0,
        globalVulnerableBoost: (ex) => ex >= 5 ? 60 : 0,
        globalASDamageMultiplier: (ex) => ex >= 7 ? 1.12 : ex >= 5 ? 1.04 : 1.0,
        specialHeroesASDamageMultiplier: (ex) => ex >= 7 ? 1.24 : ex >= 5 ? 1.08 : 1.0,
        specialHeroes: ['ミーク', '新ミーク互換', 'アイリス', 'ソフィ', 'ヒヨリ']
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
        psVulnerable: (ex) => {
          if (ex < 5) return null;
          const count = ex >= 7 ? 4 : 2;
          return { value: 30, count: count, rate: 0.11 };
        }
      },
      'フェルム': {
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
      '新シャーリー互換': {
        type: '陸軍',
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
        })
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
      'ソフィ': {
        type: '海軍',
        shieldBuff: (ex) => 66 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex, hasAbnormalCombo) => {
          // 異常特攻: 状態異常種類数 × 特攻倍率
          const abnormalTypes = hasAbnormalCombo ? 1.3 : 0.4;
          const abnormalBonus = (ex >= 7 ? 25 : ex >= 5 ? 15 : 10) * Math.min(abnormalTypes, 3);
          return 130 * exclusiveMultipliers[ex] + abnormalBonus;
        },
        asBullets: (ex) => ex >= 7 ? 5 : 3,
        // PS：毎ターン脆弱属性ダメージ（付与ロス・期待値計算済み）
        psVulnerable: (ex) => {
          if (ex >= 7) return { count: 1.5, damage: 14.17 };
          if (ex >= 5) return { count: 1.5, damage: 7.43 };
          return { count: 1.0, damage: 8.77 };
        }
      },
      'ヒヨリ': {
        type: '海軍',
        shieldBuff: (ex) => 65 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex, hasAbnormalCombo) => {
          const abnormalBonus = ex >= 7 ? 50 : ex >= 5 ? 30 : 10;
          return 130 * exclusiveMultipliers[ex] + abnormalBonus;
        },
        asBullets: (ex) => ex >= 7 ? 5 : 3,
        // PS：毎ターン脆弱属性ダメージ
        psVulnerable: (ex) => {
          if (ex >= 7) return { count: 1.5, damage: 10.63 };
          if (ex >= 5) return { count: 1.5, damage: 5.57 };
          return { count: 1.0, damage: 8.77 };
        }
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
        asArmor: { count: 1.5, value: 15 }
      },
      '新ミーク互換': {
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
        asVulnerable: { value: 15, count: 4.5, lossCoef: 0.98 }
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
        asArmor: { count: 3, value: 15 }
      },
      'レイチェル': {
        type: '海軍',
        attackBuff: (ex) => 110 * exclusiveMultipliers[ex],
        // PS収束：被ダメ減シールド種類数 × 35%（専7で70%）のダメ増加算
        shieldTypesDamageBoost: (ex) => ex >= 7 ? 70 : 35,
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
        shieldTypesBonus: (ex) => ex >= 7 ? 0.12 : 0,
        // シールド種類数への貢献：0.6固定（マリナと同時なら高い方）
        shieldTypesContribution: 0.6
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
        // シールド種類数への貢献：専5以上で0.6、専5未満で0.3
        shieldTypesContribution: (ex) => ex >= 5 ? 0.6 : 0.3
      },
      'コレット': {
        type: '海軍',
        shieldBuff: (ex) => 70 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex) => 90 * exclusiveMultipliers[ex],
        asBullets: 3,
        // 拡散ダメ：ASの1発ごとに発動、ASダメ × 40% × 拡散補正 × 2発
        scatterDamage: {
          baseRatio: 0.4,
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
        // シールド種類数への貢献：専5以上で0.5、専5未満で0.3
        shieldTypesContribution: (ex) => ex >= 5 ? 0.5 : 0.3
      },
      '新コレット互換': {
        type: '海軍',
        openingShield: (ex) => 72 * exclusiveMultipliers[ex],
        asRate: 35,
        asDamage: (ex) => 95 * exclusiveMultipliers[ex],
        asBullets: 3,
        // 拡散ダメ：ASの1発ごとに発動、ASダメ × 40% × 拡散補正 × 2発
        scatterDamage: {
          baseRatio: 0.4,
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
        // シールド種類数への貢献：専5以上で0.5、専5未満で0.3
        shieldTypesContribution: (ex) => ex >= 5 ? 0.5 : 0.3
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
          baseRatio: 0.3,
          baseBullets: 2
        },
        // 被ダメ減シールド種類数 × 20%（専5で50%）の拡散ダメ加算
        shieldTypesScatterBoost: (ex) => ex >= 5 ? 50 : 20,
        // PS：被ダメ減シールド種類数 × 10%（専7で30%）のダメ減加算
        shieldTypesDamageReductionBoost: (ex) => ex >= 7 ? 30 : 10,
        // シールド種類数への貢献：専5以上のみ0.3
        shieldTypesContribution: (ex) => ex >= 5 ? 0.3 : 0
      },
      'スターフ': {
        type: '海軍',
        // シールド種類数への貢献：固定0.5
        shieldTypesContribution: 0.5
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
        psBurning: (ex, speedCondition, hasMisty, hasAsuka) => {
          if (hasMisty || hasAsuka) return null;
          if (speedCondition !== '同攻速') return null;
          const rate = ex >= 5 ? 0.90 : 0.85;
          const value = ex >= 5 ? 120 : 30;
          return { rate, value, count: 1 };
        },
        // PSダメ増バフ：ミスティ/アスカと同時編成では発動しない
        psDamageIncreasePerRound: (ex, speedCondition, hasMisty, hasAsuka) => {
          if (hasMisty || hasAsuka) return null;
          
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
      '新リヴィア互換': {
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
        psBurning: (ex, speedCondition, hasMisty, hasAsuka) => {
          if (hasMisty || hasAsuka) return null;
          if (speedCondition !== '同攻速') return null;
          const rate = ex >= 5 ? 0.90 : 0.85;
          const value = ex >= 7 ? 130 : (ex >= 5 ? 120 : 30);  // 専7: 130%
          return { rate, value, count: 1 };
        },
        // PSダメ増バフ：専5以上でリヴィア専7相当
        psDamageIncreasePerRound: (ex, speedCondition, hasMisty, hasAsuka) => {
          if (hasMisty || hasAsuka) return null;
          
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
        // リヴィア/ユズハ/ノルシュ/新リヴィア互換との同時編成時に完全な値を返す
        psBurningBoostPerRound: (ex, hasRivvia, hasYuzuha, hasNorshu, hasNewRivvia) => {
          const base = [0, 10, 15, 15];
          if (ex >= 5) {
            const boosted = base.map(v => v * 4);
            // リヴィア/ユズハ/ノルシュ/新リヴィア互換との同時編成時は完全な値
            if (hasRivvia || hasYuzuha || hasNorshu || hasNewRivvia) {
              return boosted;
            }
            return boosted;
          }
          return base;
        },
        // 専7以上：グローバル燃焼強化+40%
        burningBoost: (ex) => ex >= 7 ? 40 : 0
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
        taunt: (ex, speedCondition, hasMisty, hasAsuka) => {
          if (speedCondition !== '同攻速') return null;
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
        asBurning: (hasYuzuha, hasNorshu) => {
          const count = (hasYuzuha || hasNorshu) ? 8 : 3;
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
        // PS連撃強化（グローバル効果）
        comboBoost: (ex) => {
          if (ex >= 7) return 15;
          if (ex >= 5) return 10;
          return 5;
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
