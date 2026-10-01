// constants.js
// 計算エンジンやUIから参照される静的定数・ユーティリティ関数をまとめたファイル。
// JSXを含まない純粋なJSのみで構成（アイコンコンポーネント等のJSXはindex.html側に残置）。
// 覚醒システム関連の定数（isAwakeningCapableHero, AWAKENING_*, getDefaultAwakening）は
// 現在まだindex.html側に残置中（開発途中のため）。

    // ユーティリティ関数
    const formatNumber = (num) => {
      if (num === 0) return '0';
      const absNum = Math.abs(num);
      const sign = num < 0 ? '-' : '';
      
      // 有効数字4桁
      const sigFigs = 4;
      
      if (absNum < 1000) {
        const digits = Math.floor(Math.log10(absNum)) + 1;
        const decimals = Math.max(0, sigFigs - digits);
        return sign + absNum.toFixed(decimals);
      }
      
      const units = ['', 'k', 'M', 'B', 'T', 'aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg', 'hh', 'ii', 'jj', 'kk', 'll', 'mm', 'nn', 'oo', 'pp', 'qq', 'rr', 'ss', 'tt', 'uu', 'vv', 'ww', 'xx', 'yy', 'zz'];
      const tier = Math.floor(Math.log10(absNum) / 3);
      
      if (tier <= units.length - 1) {
        const scaled = absNum / Math.pow(1000, tier);
        const digits = Math.floor(Math.log10(scaled)) + 1;
        const decimals = Math.max(0, sigFigs - digits);
        return sign + scaled.toFixed(decimals) + units[tier];
      }
      
      return sign + absNum.toExponential(sigFigs - 1);
    };

    // データ定義
    const soldierData = {
      103: { durability: 23.1, power: 2.89 },
      102: { durability: 21.3, power: 2.66 },
      101: { durability: 19.7, power: 2.45 },
      100: { durability: 18.2, power: 2.33 },
      83: { durability: 3.8, power: 0.989 },
      82: { durability: 3.5, power: 0.88 },
      81: { durability: 3, power: 0.75 },
      80: { durability: 2.6, power: 0.65 }
    };

    // ラウンド重み係数（火力用）- 敵の鉄壁条件に応じて変化
    const getDefaultPowerRoundWeights = (enemyIronWall) => {
      if (enemyIronWall === '鉄壁無し') {
        return [0.5, 0.3, 0.15, 0.05];
      } else if (enemyIronWall === '専用なし') {
        return [0.3, 0.4, 0.2, 0.1];
      } else if (enemyIronWall === '専用5') {
        return [0.32, 0.22, 0.27, 0.19];
      } else if (enemyIronWall === '専用7') {
        return [0.27, 0.21, 0.36, 0.16];
      } else if (enemyIronWall === '専用7＋Lv7破壊不能') {
        return [0.28, 0.25, 0.28, 0.19];
      }
      // デフォルト（専用5の値）
      return [0.32, 0.22, 0.27, 0.19];
    };
    
    // ラウンド重み係数（耐久用）- デフォルト
    const defaultDurabilityRoundWeights = [0.32, 0.22, 0.27, 0.19];

    // 衰弱率テーブル（付与数1個用）
    const debuffRate1 = {
      18: { noRush: 13.25, withRush: 16.48 },
      20: { noRush: 14.58, withRush: 18.13 },
      22: { noRush: 15.89, withRush: 19.75 },
      24: { noRush: 17.17, withRush: 21.34 },
      26: { noRush: 18.42, withRush: 22.91 },
      28: { noRush: 19.65, withRush: 24.44 },
      30: { noRush: 20.81, withRush: 25.86 },
      31: { noRush: 21.44, withRush: 26.65 },
      32: { noRush: 22.06, withRush: 27.42 },
      34: { noRush: 23.28, withRush: 28.96 },
      35: { noRush: 23.88, withRush: 29.74 },
      36: { noRush: 24.48, withRush: 30.49 },
      37: { noRush: 25.08, withRush: 31.25 },
      38: { noRush: 25.67, withRush: 32.00 },
      39: { noRush: 26.26, withRush: 32.74 },
      40: { noRush: 26.84, withRush: 33.48 },
      41: { noRush: 27.42, withRush: 34.22 },
      42: { noRush: 28.00, withRush: 34.96 }
    };

    // 衰弱率テーブル（付与数2個用）
    const debuffRate2 = {
      18: { noRush: 24.81, withRush: 30.06 },
      20: { noRush: 27.13, withRush: 32.88 },
      22: { noRush: 29.38, withRush: 35.61 },
      24: { noRush: 31.55, withRush: 38.24 },
      26: { noRush: 33.64, withRush: 40.77 },
      28: { noRush: 35.65, withRush: 43.21 },
      30: { noRush: 37.13, withRush: 45.03 },
      31: { noRush: 38.08, withRush: 46.19 },
      32: { noRush: 39.01, withRush: 47.34 },
      34: { noRush: 40.83, withRush: 49.57 },
      35: { noRush: 41.71, withRush: 50.66 },
      36: { noRush: 42.59, withRush: 51.73 },
      37: { noRush: 43.45, withRush: 52.78 },
      38: { noRush: 44.29, withRush: 53.82 },
      39: { noRush: 45.12, withRush: 54.84 },
      40: { noRush: 45.94, withRush: 55.85 },
      41: { noRush: 46.74, withRush: 56.84 },
      42: { noRush: 47.53, withRush: 57.81 }
    };

    // 衰弱率を取得する関数（線形補正対応）
    const getDebuffRate = (asRate, count, hasRush) => {
      const ratePercent = Math.round(asRate * 100);
      const table = count === 1 ? debuffRate1 : debuffRate2;
      const key = hasRush ? 'withRush' : 'noRush';
      
      // テーブルのキー（発動率）を数値配列に変換してソート
      const rates = Object.keys(table).map(r => parseInt(r)).sort((a, b) => a - b);
      const minRate = rates[0];  // 18
      const maxRate = rates[rates.length - 1];  // 42
      
      // 範囲内の場合：最も近い値を使用
      if (ratePercent >= minRate && ratePercent <= maxRate) {
        let closestRate = minRate;
        let minDiff = Math.abs(ratePercent - minRate);
        
        for (const rate of rates) {
          const diff = Math.abs(ratePercent - rate);
          if (diff < minDiff || (diff === minDiff && rate > closestRate)) {
            closestRate = rate;
            minDiff = diff;
          }
        }
        
        return table[closestRate][key] / 100;
      }
      
      // 最小以下の場合：0%と最小値の間で線形補正
      if (ratePercent < minRate) {
        const minValue = table[minRate][key];
        // (0%, 0) と (minRate%, minValue%) の間で補間
        return (minValue / minRate) * ratePercent / 100;
      }
      
      // 最大以上の場合：最大2つの値の間で線形補正
      const secondMaxRate = rates[rates.length - 2];
      const maxValue = table[maxRate][key];
      const secondMaxValue = table[secondMaxRate][key];
      
      // 傾き = (maxValue - secondMaxValue) / (maxRate - secondMaxRate)
      const slope = (maxValue - secondMaxValue) / (maxRate - secondMaxRate);
      const extrapolatedValue = maxValue + slope * (ratePercent - maxRate);
      
      return extrapolatedValue / 100;
    };


    // ===== システム開発ログ =====
    // 新しいログは配列の先頭に追加してください（新しい順に表示されます）。
    // date: 'YYYY-MM-DD', version: 'vX.X.X', category: '機能' | '英雄' | 'バランス' | 'UI' など自由, text: 内容
    const devLog = [      
      { date: '2026-09-21', version: 'v1.9.0', category: '機能', text: '覚醒スキルのASダメージ加算・開戦シールド加算を、エンジン側での個別加算からheroData.js側の統一ヘルパー（resolveAsDamage/resolveShieldBuff/resolveOpeningShield）に一本化。これにより全軍突撃・拡散ダメージ（ピスカ等）・スキル再発動など、ASダメージを参照する全箇所に覚醒加算が自動的に伝播するようになった（従来は本体AS以外に伝播していなかった漏れを解消）' },
      { date: '2026-09-21', version: 'v1.8.0', category: '機能', text: '覚醒スキルの構造を簡素化：type別の分岐処理をエンジンから廃止し、heroData.js側で計算済みの最終値を名前付きプロパティ（shieldBonus/asDamageBonus/attachedMagnetics等）として返す方式に統一（再発動のみ引き続き小さな記述を持つ）。ミヤのASダメージ加算[1.5,3,4.5,7,10]と磁気燃焼ダメージ軽減[3.75,7.5,11.25,17.5,25]が逆になっていた数値ミスを修正。ソフィ・ピスカ・ルチルの覚醒スキル1（開戦シールド加算＋ASダメージ加算、ミヤと共通ロジック）を追加' },
      { date: '2026-09-21', version: 'v1.7.0', category: '機能', text: 'ミヤの覚醒スキル1～4を正式実装（開戦シールド加算、ASダメージ加算、AS付随磁気×2種、グローバル磁気効果強化、パッシブ磁気ダメージ加算、新規「磁気燃焼ダメージ軽減」効果）。覚醒タブにタイタンと同様のON/OFFトグルを追加（OFF＝全スキルランク0と同義）。覚醒スキルの効果値・テーブルは全てheroData.jsに集約し、エンジン側は type別の汎用集計処理のみを持つ構造に整理' },
      { date: '2026-09-21', version: 'v1.6.0', category: '機能', text: '覚醒スキル3の再発動をランク6で解禁、ランク7～10でダメージ割合7.5/15/22.5/35/50%に変更（AWAKENING_SKILL3_REACTIVATION_DAMAGEテーブルとしてheroData.jsに集約）。AS付随効果（付随磁気・付随燃焼）はダメージ割合の影響を受けず常に100%で再発動するよう分離。衰弱付与（衝撃等）とタイタンのAS付随効果（磁場・灼熱・破凱）に「トリガー確率＝AS発動率×(1+条件重み×再発動確率)」を適用。鉄壁継続ラウンドの破壊不能+1補正をタイタンON時のみ有効化。副次的にhasMisty等のTDZクラッシュバグ（元ファイルに存在）も解消' },
      { date: '2026-09-21', version: 'v1.5.1', category: '機能', text: '覚醒スキル用語を「レベル」→「ランク」に統一。ミヤ・ルチルの覚醒スキル3の再発動確率を60%固定に確定。鉄壁継続ラウンド判定に破壊不能の+1ラウンドを反映（既存のironWallMaxRoundsForShieldを再利用）。スキル3を複合効果（配列）形式に変更し、再発動以外の未確定効果を後から追加できる構造に調整' },
      { date: '2026-09-21', version: 'v1.5.0', category: '機能', text: '覚醒スキル「再発動」系（type: reactivation）の汎用エンジンを実装。ミヤ・ルチルの覚醒スキル3に仮値でプレースホルダー実装（要調整）。calculations useMemoの依存配列にawakeningが漏れていたバグを修正' },
      { date: '2026-09-21', version: 'v1.4.0', category: '機能', text: '兵種相性条件を「同兵種・不利」から「同兵種」「相性不利」の2つに分割（挙動は従来と同一、将来の条件分け拡張に対応）。相性環境設定に「敵の磁気燃焼依存率」「敵の異常ダメージ軽減」を追加し、全ての磁気・燃焼ダメージに軽減効果を適用' },
      { date: '2026-09-21', version: 'v1.3.3', category: '機能', text: '英雄計算に「磁気ダメージ依存率」「燃焼ダメージ依存率」を追加。追撃1発の火力重み等の既存4項目と合わせて折りたたみ式「さらに詳しく」にまとめた' },
      { date: '2026-09-21', version: 'v1.3.2', category: '機能', text: 'ファイル分割：CSSをstyle.css、静的定数・ユーティリティ関数をconstants.jsに分離（計算エンジン・覚醒ロジックは分割対象外）' },
      { date: '2026-09-21', version: 'v1.3.1', category: '機能', text: '覚醒可否をheroData.js側のawakeningCapableに移行、覚醒タブの配色をタイタン装備と統一、スキルレベル入力をスライダー化、タブアイコンを他タブと同様のシンプルなSVGに変更' },
      { date: '2026-09-21', version: 'v1.3.0', category: '機能', text: '覚醒システムの土台を実装（対応英雄フラグ、覚醒タブ、スキルLv0-10入力欄）。対応英雄：ミヤ・ソフィ・メル・ピスカ・ルチル・ビスコット' },
      { date: '2026-09-21', version: 'v1.2.2', category: '機能', text: '全軍突撃の拡散ダメージ英雄についてのバグを修正' },
      { date: '2026-09-21', version: 'v1.2.1', category: '機能', text: '保存データをバフ設定の上に独立配置、「デフォルト設定を読み込む」を追加' },
      { date: '2026-09-21', version: 'v1.2.1', category: '機能', text: '開発ログを実装' },
      { date: '2026-09-21', version: 'v1.2.1', category: '英雄', text: 'デスコ実装' },
      { date: '2026-09-21', version: 'v1.2.1', category: '英雄', text: 'レイチェルの収束の加算効果を専7→専5に修正' },
      { date: '2026-09-21', version: 'v1.2.1', category: '機能', text: 'ローカルストレージによる保存機能を実装' }
    ];

    const presets = {
      1: ['フランカ', 'ミヤ', 'ルネ'],
      2: ['立華つむぎ', 'メル', 'ミーチェ'],
      3: ['アデル', 'ソフィ', 'マゼリア'],
      4: ['マリナ', 'ピスカ', 'アイリス'],
      5: ['リヴィア（神秘）', 'ルチル', 'ノルシュ'],
      6: ['ギャビー', 'ビスコット', 'フローリア']
    };

    const titanEffects = {
      rifle: {
        effects: [
          { name: '戦場洞察', desc: 'ダメ増バフ加算', levels: [10, 15, 20, 25, 30, 35, 40] },
          { name: '衝撃', desc: '衰弱付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '灼熱', desc: '燃焼付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '磁場', desc: '磁気付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '破凱', desc: '脆弱付与', levels: [15, 30, 30], counts: [1, 1, 2], lossCoefs: [0.98, 0.98, 0.95] },
          { name: '砲撃の嵐', desc: '攻撃強化の強化', levels: [4, 7, 11, 15, 19, 23, 30] },
          { name: '全軍突撃', desc: 'R1のみ追撃２回発動', levels: [15, 18, 22, 27, 33, 40, 50] }
        ]
      },
      armor: {
        effects: [
          { name: '補足不能', desc: 'ダメ減バフ加算', levels: [10, 15, 20, 25, 30, 35, 40] },
          { name: '振動', desc: '衰弱強化', levels: [15, 22, 30] },
          { name: '点火', desc: '燃焼強化', levels: [15, 22, 30] },
          { name: '着磁', desc: '磁気強化', levels: [15, 22, 30] },
          { name: '重撃', desc: '脆弱強化', levels: [15, 22, 30] },
          { name: '鋼の奔流', desc: '開戦シールドの強化', levels: [4, 7, 11, 15, 19, 23, 30] },
          { name: '破壊不能', desc: '鉄壁１ラウンド追加', levels: [15, 18, 22, 27, 33, 40, 50] }
        ]
      },
      vision: {
        effects: [
          { name: '戦場洞察', desc: 'ダメ増バフ加算', levels: [10, 15, 20, 25, 30, 35, 40] },
          { name: '衝撃', desc: '衰弱付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '灼熱', desc: '燃焼付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '磁場', desc: '磁気付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '破凱', desc: '脆弱付与', levels: [15, 30, 30], counts: [1, 1, 2], lossCoefs: [0.98, 0.98, 0.95] }
        ]
      },
      head: {
        effects: [
          { name: '補足不能', desc: 'ダメ減バフ加算', levels: [10, 15, 20, 25, 30, 35, 40] },
          { name: '振動', desc: '衰弱強化', levels: [15, 22, 30] },
          { name: '点火', desc: '燃焼強化', levels: [15, 22, 30] },
          { name: '着磁', desc: '磁気強化', levels: [15, 22, 30] },
          { name: '重撃', desc: '脆弱強化', levels: [15, 22, 30] }
        ]
      },
      handy: {
        effects: [
          { name: '戦場洞察', desc: 'ダメ増バフ加算', levels: [10, 15, 20, 25, 30, 35, 40] },
          { name: '衝撃', desc: '衰弱付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '灼熱', desc: '燃焼付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '磁場', desc: '磁気付与', levels: [15, 30, 30], counts: [1, 1, 2] },
          { name: '破凱', desc: '脆弱付与', levels: [15, 30, 30], counts: [1, 1, 2], lossCoefs: [0.98, 0.98, 0.95] }
        ]
      },
      boots: {
        effects: [
          { name: '補足不能', desc: 'ダメ減バフ加算', levels: [10, 15, 20, 25, 30, 35, 40] },
          { name: '振動', desc: '衰弱強化', levels: [15, 22, 30] },
          { name: '点火', desc: '燃焼強化', levels: [15, 22, 30] },
          { name: '着磁', desc: '磁気強化', levels: [15, 22, 30] },
          { name: '重撃', desc: '脆弱強化', levels: [15, 22, 30] }
        ]
      }
    };

    const slotNames = ['rifle', 'armor', 'vision', 'head', 'handy', 'boots'];
    const slotDisplayNames = ['ライフル', 'アーマー', '視野', 'ヘッド', 'ハンディ', 'ブーツ'];
