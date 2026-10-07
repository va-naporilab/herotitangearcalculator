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

    // 単位（k/M/B…）を付けない表示用。有効数字4桁は1000未満のみ適用、1000以上は整数＋桁区切り。
    // 英雄計算コーナーなど、数値をそのまま見たい箇所で使う。
    const formatNumberPlain = (num) => {
      if (num === 0) return '0';
      if (!isFinite(num)) return String(num);
      const absNum = Math.abs(num);
      const sign = num < 0 ? '-' : '';
      if (absNum < 1000) {
        const digits = Math.floor(Math.log10(absNum)) + 1;
        const decimals = Math.max(0, 4 - digits);
        return sign + absNum.toFixed(decimals);
      }
      return sign + Math.round(absNum).toLocaleString('en-US');
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
    // ・text はテンプレートリテラル（バッククォート）なので、改行をそのまま書けます。
    // ・超マイナー調整は version を省略してOK（バージョン表記は version 付きログの最大値から自動決定）。
    const devLog = [
      { date: '2026-10-07', version: 'v2.1.2', category: '修正', text: `覚醒スキル３のランク６解禁効果が正常に適用されない問題を修正` },
      { date: '2026-10-04', version: 'v2.1.1', category: 'UI', text: `携帯画面での表示問題を修正、右上にメニューを追加。` },
      { date: '2026-10-04', version: 'v2.1.1', category: '修正', text: `覚醒スキル３のランク６解禁効果にも編成条件を適用` },
      { date: '2026-10-04', version: 'v2.1.0', category: '機能', text: `各出力項目をクリックすると、名称・値・説明をポップアップ表示する機能を実装（説明文は statDescriptions で管理）` },
      { date: '2026-10-04', version: 'v2.1.0', category: 'UI', text: `ページ下部にクレジット・注意書きを追加。開発ログのカテゴリー配色を刷新し、インラインスタイルをstyle.cssへ移行` },
      { date: '2026-10-04', version: 'v2.0.0', category: '英雄', text: `第１弾の覚醒を実装完了：ミヤ・メル・ソフィ・ピスカ・ルチル・ビスコット` },
      { date: '2026-10-04', version: 'v2.0.0', category: '機能', text: `英雄計算特性値に現編成の「衰弱量」を追加、環境変数に「敵の衰弱量」を追加、ビスコットの衰弱抵抗ロジックを構築` },
      { date: '2026-10-04', version: 'v2.0.0', category: '修正', text: `拡散ダメージをAS本体に対する割合ではなく指定値の絶対値ダメージに修正` },
      { date: '2026-10-04', version: 'v2.0.0', category: '修正', text: `燃焼空軍などで鼓動がパッシブ燃焼にも作用していたバグを修正` },
      { date: '2026-10-04', version: 'v2.0.0', category: '機能', text: `ダメージ台帳を実装、各ダメージに関連タグを追加` },
      { date: '2026-10-04', version: 'v2.0.0', category: 'UI', text: `各英雄計算値に覚醒の増分表示を実装（覚醒ON-OFFの比較）` },
      { date: '2026-09-21', version: 'v1.9.0', category: '開発', text: `覚醒スキル情報を、計算エンジン側での個別加算から英雄データ側に移行` },
      { date: '2026-09-21', version: 'v1.8.0', category: '機能', text: `ソフィ・ピスカ・ルチルの覚醒スキル1（開戦シールド加算＋ASダメージ加算、ミヤと共通ロジック）を追加` },
      { date: '2026-09-21', version: 'v1.7.0', category: '英雄', text: `ミヤの覚醒スキル1～4を実装（開戦シールド加算、ASダメージ加算、AS付随磁気×2種、グローバル磁気効果強化、パッシブ磁気ダメージ加算、新規「磁気燃焼ダメージ軽減」効果）` },
      { date: '2026-09-21', version: 'v1.6.0', category: 'UI', text: `覚醒効果に対しONOFFトグルを実装` },
      { date: '2026-09-21', version: 'v1.6.0', category: '機能', text: `AS付随効果（付随磁気・付随燃焼）はダメージ割合の影響を受けず常に100%で再発動するよう分離。衰弱付与（衝撃等）とタイタンのAS付随効果（磁場・灼熱・破凱）に「トリガー確率＝AS発動率×(1+条件重み×再発動確率)」を適用` },
      { date: '2026-09-21', version: 'v1.5.1', category: '機能', text: `鉄壁継続ラウンド判定に破壊不能の+1ラウンドを反映` },
      { date: '2026-09-21', version: 'v1.5.0', category: '機能', text: `覚醒スキル「再発動」系を実装（ミヤ・ルチルの覚醒スキル3）、タイタン等の付与量の連動を確認` },
      { date: '2026-09-21', version: 'v1.4.0', category: '機能', text: `相性環境設定に「敵の磁気燃焼依存率」「敵の異常ダメージ軽減」を追加し、編成中の磁気・燃焼ダメージに軽減効果を適用` },
      { date: '2026-09-21', version: 'v1.3.3', category: '機能', text: `英雄計算の特性値に「磁気ダメージ依存率」「燃焼ダメージ依存率」を追加` },
      { date: '2026-09-21', version: 'v1.3.2', category: '開発', text: `ファイル分割：CSS、静的定数などを分離` },
      { date: '2026-09-21', version: 'v1.3.1', category: 'UI', text: `覚醒タブの配色をタイタン装備と統一、スキルランク入力をスライダー化、タブアイコンをシンプルなSVGに変更` },
      { date: '2026-09-21', version: 'v1.3.0', category: 'UI', text: `覚醒システムの準備（対応英雄の指定、覚醒タブ、スキルLv0-10入力欄）。現対応英雄：ミヤ・ソフィ・メル・ピスカ・ルチル・ビスコット` },
      { date: '2026-09-21', version: 'v1.2.2', category: '修正', text: `全軍突撃の拡散ダメージ英雄についてのバグを修正` },
      { date: '2026-09-21', version: 'v1.2.1', category: '機能', text: `保存データを上部に移動、「デフォルト設定を読み込む」を追加` },
      { date: '2026-09-21', version: 'v1.2.1', category: '英雄', text: `デスコ実装` },
      { date: '2026-09-21', version: 'v1.2.1', category: '英雄', text: `レイチェルの収束の加算効果を専7→専5に修正` },
      { date: '2026-09-21', version: 'v1.2.1', category: '機能', text: `ローカルストレージによる保存機能を実装` },
      { date: '2026-09-21', version: 'v1.2.1', category: '機能', text: `開発ログを実装` }
    ];

    // ===== バージョン表記（タイトル・ヘッダーで共通使用） =====
    // devLog のうち version を持つエントリの最大値を採用（並び順を間違えても矛盾しない）。
    const compareVersion = (a, b) => {
      const pa = String(a).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
      const pb = String(b).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d;
      }
      return 0;
    };
    const getLatestVersion = (log) =>
      log.filter(l => l.version).map(l => l.version).reduce((m, v) => (m === null || compareVersion(v, m) > 0 ? v : m), null) || 'v0.0.0';
    const APP_VERSION = getLatestVersion(devLog);
    const APP_TITLE = '複合英雄強さ計算ツール';

    // 開発ログの1ページあたりの表示件数
    const DEVLOG_PAGE_SIZE = 20;

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

    // ===== 開発ログのカテゴリー → CSSクラス（配色は style.css の .devlog-cat-* で定義） =====
    // 未登録のカテゴリーは 'other' 扱いになります。
    const devLogCategoryClass = {
      '機能': 'feature',
      '英雄': 'hero',
      'バランス': 'balance',
      'UI': 'ui',
      '修正': 'fix',
      '開発': 'dev'
    };

    // ===== サイトメニュー（ヘッダー右上のメニューボタンに表示） =====
    // name: 表示名 / url: リンク先 / current: true で「現在のページ」表示（リンク無効）
    // newTab: true で別タブで開く（外部サイト向け。省略時は同じタブ）
    // url が空（''）の項目は「準備中」として灰色表示（リンクなし）。追加・並べ替えはこの配列を編集するだけでOK。
    const siteMenu = {
      title: '他のツール',
      items: [
        { name: '複合英雄強さ計算ツール', url: 'index.html', current: true },
        { name: 'ナポリ探究所 - ツール集', url: 'https://sites.google.com/view/naporilab/tools' },
        { name: '換算値と装備バフ比較', url: 'https://va-naporilab.github.io/equipmentbuff-evaluator/' },
        { name: 'X（Twitter）- なぽ', url: 'https://x.com/naporitan1_3531' }
        // 例: { name: '○○ツール', url: 'https://ユーザー名.github.io/リポジトリ名/', newTab: true },
      ]
    };

    // ===== ページ下部のクレジット・注意書き =====
    const footerInfo = {
      credits: [
        `本ツールは個人が制作した非公式のシミュレーターであり、ビビッドアーミー／TopWar公式とは一切関係ありません。`,
        `ゲームデータの著作権は、G123ないしはRivergameに帰属します。`,
        `考察の考え方の一部は空野こんこん氏のブログを参考としています。また、覚醒の効果などの検討には、topwarfandom.com においてNass氏が公開している情報を参照しています。`
      ],
      notice: `本ツール内での計算ロジックのほとんどは、考察に基づく期待値上の概算であり、ゲーム内での挙動を正確にとらえているとは限りません。`,
      contactLead: '質問・ご連絡・バグの報告は',
      contacts: [
        { label: 'X', id: 'naporitan1_3531', url: 'https://x.com/naporitan1_3531' },
        { label: 'Discord', id: 'naporitan1sei_05103' }   // urlなし＝テキスト表示
      ],
      contactTail: 'までお願いします。',
      copyright: '© 2026 ナポリタン1世（Napo）'
    };

    // ===== 出力項目のポップアップ説明（出力値クリックのポップアップで表示） =====
    // キーは calculations の項目名。name: ポップアップ見出し / desc: 説明文。
    // 手動で説明を書く場合は desc を書き換えるだけでOK。未記入は STAT_DESC_PENDING のまま。
    // desc はテンプレートリテラル（`...`）なので、そのまま改行して書けます（改行は表示にも反映）。
    // 文中に ` や ${ を使いたい場合のみ、前に \ を付けてください。
    const STAT_DESC_PENDING = '説明を準備中';
    const statDescriptions = {

      heroBasePower: { name: '基礎英雄火力', desc: 
        `英雄の【攻撃強化】や【ダメ増バフ加算】 などによる編成全体の基礎火力の上昇倍率。
        
        敵の衰弱量を受けて減少する。` },

      heroBaseDurability: { name: '基礎英雄耐久', desc: `英雄の【開戦シールド】や【ダメ減バフ加算】などによる編成全体の基礎耐久の上昇倍率。` },

      totalASDamage: { name: '追撃総ダメージ', desc:
         `編成全体の【アクティブスキル】（追撃・AS）とそれに起因するダメージの合計。
        （１ターンあたりのダメージ量の期待値）

        敵の沈黙数を受けて減少する。
        ダメージ台帳の「AS」集計に相当。` },

      passiveDamage: { name: 'パッシブダメージ', desc: 
        `編成全体の【パッシブスキル】（PS）や【通常攻撃】などのアクティブスキルの発動に依存しないダメージの合計。
        （１ターンあたりのダメージ量の期待値）

        ダメージ台帳の「PS」集計に相当。` },

      ironWallCorrection: { name: '鉄壁耐久補正', desc: 
        `【鉄壁】スキルの効果による耐久の補正倍率。
        
        （「同格相手にどれだけの生命を増やす効果と同等か」を想定した値の目安なので格上・格下戦では過小評価）` },

      otherCompositeDurabilityCoef: { name: '他複合耐久係数', desc: 
        `【衰弱】【沈黙】【重甲】などの影響を複合した耐久の補正倍率。
        
        これらの効果値は想定する敵次第で変動しうる。
        「相性環境設定」で想定する敵の特性値を入力して調整可能。` },

      heroPower: { name: '英雄火力', desc: 
        `基礎英雄火力ｘ（追撃総ダメージ＋パッシブダメージ）
        
        で計算される編成の火力倍率。
        
        （９枠の敵を想定するためボスダメージとは必ずしも比例しない）` },

      heroDurability: { name: '英雄耐久', desc: 
        `基礎英雄耐久ｘ鉄壁耐久補正ｘ他複合耐久係数
        
        で計算される編成の耐久倍率。
        
        （挙動シミュレーションなどにおいては変動性のある鉄壁効果を排除した値を用いる可能性がある）` },

      heroStrength: { name: '英雄強さ値', desc: 
        `「英雄と特殊効果に起因する強さ」の最終指標。

        英雄火力ｘ英雄耐久

        から算出される。

        （火力ｘ耐久による強さの評価は正確に推定できればその値の比較で高精度で勝敗を推測できる。詳しくはランチェスターの法則などを参照）` },

      rushRatio: { name: '追撃１発の火力重み', desc: 
        `【アクティブスキル】（追撃・AS）のダメージの１発分が１ターンの総ダメージに占める割合。
        
        【重甲】の効果を考える際は想定する敵のこの値を相性環境設定に入力する。` },

      directDamagePerBullet: { name: '直接攻撃１発の平均ダメージ', desc: 
        `直接攻撃（通常攻撃やアクティブスキルの本体や拡散ダメージなど物理的な攻撃）が１発あたりで与えるダメージの平均。
        
        【脆弱】でのダメージ増加量を計算するのに用いられる。` },

      directDamageRatio: { name: '直接攻撃１発の火力重み', desc: 
        `直接攻撃（通常攻撃やアクティブスキルの本体や拡散ダメージなど物理的な攻撃）の１発当たりのダメージ量が１ターンの総ダメージに占める割合。
        
        【耐性】などの効果を考える際は想定する敵のこの値を相性環境設定に入力する。` },


      rushDependencyRatio: { name: '追撃依存率', desc: 
        `編成の総ダメージのうち、【アクティブスキル】（追撃・AS）の発動に依存する割合を表す値。
        
        【沈黙】の効果を考える際は想定する敵のこの値を相性環境設定に入力する。` },

        
      magneticDependencyRatio: { name: '磁気ダメージ依存率', desc: 
        `編成の総ダメージのうち、【磁気】ダメージの占める割合を表す値。
        
        敵の【磁気燃焼ダメージ軽減】の影響の受けやすさを表す。
        現編成を想定敵として別編成で【磁気燃焼ダメージ軽減】を評価する場合は、ここに表示される磁気と燃焼の依存率の和を相性環境設定に入力する。` },

      burningDependencyRatio: { name: '燃焼ダメージ依存率', desc: 
        `編成の総ダメージのうち、【燃焼】ダメージの占める割合を表す値。
        
        敵の【磁気燃焼ダメージ軽減】の影響の受けやすさを表す。
        現編成を想定敵として別編成で【磁気燃焼ダメージ軽減】を評価する場合は、ここに表示される磁気と燃焼の依存率の和を相性環境設定に入力する。` },

      weakenAmountLeveled: { name: '衰弱量（平準化）', desc: 
        `【衰弱】効果の影響を９枠で「平準化」した値。
        
        単純な９枠の衰弱値の平均ではなく、衰弱が適用される枠とそうでない枠の火力の和から逆算した値で、９枠に同量の衰弱を付与した場合の相当量。
        
        例：
        ３枠に１００％の衰弱を付与して３枠の火力が半分になっても、６枠の火力はそのままなので、合計火力は元の８２.５％となる。
        この場合、同等の合計火力となるように９枠に「平準化」した２１.２％の衰弱量として評価するのが正しいが、単純に９枠で衰弱値を「平均」すると３３％と過剰評価になってしまうのである。
        
        （当ツールでは、厳密には「付与する枠数」ではなく、各衰弱効果ごとに敵の特定の枠が「行動時に衰弱状態である確率」（衰弱率％）で管理しており、複数の衰弱効果がある場合はその重複パターンを場合分けして合計衰弱値とその発生確率をもとに平準化を行っている。うん、何言ってるかわからん余ね。余もよく分かってない。）` },


      compatDurability: { name: 'バフ相性耐久', desc: 
        `バフと兵種相性による耐久の倍率。
        （生命倍率ｘダメ減倍率ｘ防御倍率ｘ相性防御倍率）
        
        各バフはあくまで増加量で０％でも元の１００％（１倍）があるので＋１００％を足してから１００％で割った値が実効倍率。` },


      compatPower: { name: 'バフ相性火力', desc: 
        `バフと兵種相性による火力の倍率。

        （（攻撃ｘ乖離係数＋相性ダメ増）の倍率ｘダメ増倍率）
        
        各バフはあくまで増加量で０％でも元の１００％（１倍）があるので＋１００％を足してから１００％で割った値が実効倍率。
        相性ダメ増は攻撃バフの増加量として加算される仕様。また、攻撃バフは一部のバフが倍の効果を持っていたりするので最終値が1.4倍などになりうる。
        この倍率を相性環境設定内の「火力乖離係数」として設定している。` },


      compatStrength: { name: 'バフ相性強さ値', desc: 
        `バフと兵種相性の影響を考慮した強さの指標。
        
        バフ相性火力ｘバフ相性耐久` },

      compatTroopDurability: { name: 'バフ相性出撃耐久', desc: `バフと兵種相性の耐久倍率に出撃数を掛けたもの。` },
      compatTroopPower: { name: 'バフ相性出撃火力', desc: `バフと兵種相性の火力倍率に出撃数を掛けたもの。` },

      compatTroopStrength: { name: 'バフ相性出撃強さ値', desc: 
        `バフ相性出撃火力ｘバフ相性出撃耐久。
        
        火力も耐久も出撃数に比例するので、「強さ」は出撃数の二乗に比例する。` },

      compatTroopSoldierDurability: { name: 'バフ相性出撃兵士耐久', desc: `「バフ相性出撃耐久」に兵士Lvに応じたユニットの「基礎生命」を掛けたもの。` },
      compatTroopSoldierPower: { name: 'バフ相性出撃兵士火力', desc: `「バフ相性出撃火力」に兵士Lvに応じたユニットの「基礎攻撃力」を掛けたもの。` },
      compatTroopSoldierStrength: { name: 'バフ相性出撃兵士強さ値', desc: `バフ・兵種相性・出撃数・ユニットを考慮した「強さ」の指標。` },
      totalDurability: { name: '総合耐久', desc: 
        `バフ相性出撃兵士耐久ｘ英雄耐久
        
        部隊が耐えられる総ダメージ量の目安となる指標だが、実際のゲーム内ではダメ減と防御や【鉄壁】によって元ダメージより低い被ダメージとなっている上に、ラウンドごとに変化する【鉄壁】効果によってダメージトラッキングは難しい。` },


      totalPower: { name: '総合火力', desc: 
        `バフ相性出撃兵士火力ｘ英雄火力
        
        部隊がラウンド毎に与えるダメージ量の目安となる指標だが、実際のゲーム内では敵のダメ減と防御や【鉄壁】によって元ダメージより低い与ダメージとなっている上に、ラウンドごとに変化する【鉄壁】効果によってダメージトラッキングは難しい。
        また対人戦闘では自身の出撃数の減衰にも左右され、ボスダメージは９枠の敵でないのでダメージ付与量も変動する。` },


      totalStrength: { name: '編成総合強さ値', desc: 
        `総合火力ｘ総合耐久
        　　　あるいは、
        バフ相性出撃兵士強さ値ｘ英雄強さ値
        
        各種の条件が違う２編成間で強さ比較する場合は、この値を用いる。` },

      powerDurabilityRatio: { name: '編成の火力耐久比', desc: 
        `編成の最終的な火力と耐久のバランスを表す比率。
        （総合火力/総合耐久）

        応用計算では「鉄壁耐久係数」を掛けて【鉄壁】の効果を除外して運用することもありそう...？
        「鉄壁抜きの火力耐久比」は、戦闘ラウンド数予想や高速負けの時の火力減衰、鉄壁の条件毎評価にも応用できる...と思う、余は。` }
    };
