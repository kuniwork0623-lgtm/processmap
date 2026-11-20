# ProcessMap

制作の工程表アプリ。メインタスク → 子タスク → 孫タスクの3階層で工程を並べ、手動で完了をチェックして進み具合を把握する。AIが作ったスケジュールを箇条書きのまま一括登録できる。

- 公開URL: https://processmap-green.vercel.app
- ソース: このリポジトリ（`kuniwork0623-lgtm/processmap`）。**唯一の正本**
- 本番の基準点: `main` の最初のコミット `1905d92` = Vercel本番デプロイ `dpl_7LDsZ8dQGE2PLYa5jvZS4Bea4XTT`（2026-11-15）をそのまま取り込んだもの

## 管理のしくみ（秘書）

計画は必ず崩れる前提で、ツール側が次のルールを守らせる。

1. **締切は固定、中身で調整** — 間に合わないときは期日を延ばさず「あったら良い」（後回し可）に回す
2. **思いついたら「あとで箱」** — 作業中は予定をいじらない。画面左下「💡 思いついた」
3. **細かく決めるのは今週だけ** — 「★今週」は最大5個
4. **週1回5分の見直し** — 終わったものをチェック → あとで箱の仕分け → 間に合うか確認 → 今週の★を選ぶ

画面上部の**秘書バー**が状況から「今やること」を1つ指示する（段取り未作成 → 締切未設定 → 見直し期限 → 遅れ → あとで箱が多い → 期限切れ → ★未選択 → 次のタスク）。「今週・困ったとき」を開くと、今週の★、完了見込み、困ったときの対処が出る。
**AIに相談**は状況と工程表（#ID・[x]・★・（あったら良い）付き）を相談文にしてコピーし、AIの返答の「---工程表---」以降を取り込む。完了済みは名前・期日・完了を変えず、AIの案から消えても残す。変わった項目は色付きでハイライトされ、見直し・相談の内容は「変更履歴」に残る。
完了見込みは、最近14日間の完了数（完了日 `doneAt`）から計算する。

## 操作（主なもの）

| 操作 | 方法 |
|---|---|
| カードのメニュー（孫追加・完了・期日/メモ・移動・枠線・削除） | カードにマウスを乗せて「⋯」、または右クリック、選択中に Shift+F10 |
| 一段下に追加 | Tab（メイン→子、子→孫） |
| 孫を子に上げる | Shift+Tab |
| 次のタスク | Enter |
| 完了の切り替え | Ctrl（⌘）+Enter |
| タスク間の移動 | ↑ / ↓ |
| 並べ替え | ドラッグ（文字の上からでも可）、Ctrl+Shift+↑↓ |
| 編集終了 / 削除 | Esc / 選択中に Delete、空のタスクで Backspace |
| ズーム | Ctrl（⌘）+ホイール、ピンチ、右下の＋− |

## 構成

ビルド不要の静的サイト。Vercel にはファイルをそのままアップロードしている（Git連携なし）。

| ファイル | 役割 |
|---|---|
| `index.html` | 画面のすべて（CSS + アプリ本体のJS）。タスク編集・Tab追加・URLリンク・ドラッグ・ズーム・配色・シート・期日/メモ・AI取り込み・AIスケジュール登録 |
| `sync.js` | Supabase JS ライブラリを同梱したバンドル（約180KB）。**ProcessMap固有のログイン・同期処理は末尾の約7KB**（`var oa=ie(()=>{...` 以降） |
| `config.js` | Supabase の URL と **publishable key（公開用キー）**。ブラウザに出してよいキー |
| `vercel.json` | セキュリティヘッダーと `Cache-Control: no-store` |
| `tests/run.mjs` | Playwright 回帰テスト（PC 1440×900 / スマホ 390×844）。Supabase は**模擬サーバー**で置き換え、本番DBに触れない |
| `tests/serve.mjs` | ローカル確認用の静的サーバー |
| `scripts/deploy.sh` | Vercel へのデプロイ（プレビュー／本番） |

### データと同期

- 保存先: Supabase プロジェクト `processmap`（ref `xgeviftkyrxhqbpgpfea`）のテーブル `public.processmap_documents`（1ユーザー1行。列 `user_id`, `document`(JSON), `revision`）
- 読み込み: `select document,revision where user_id = 自分`
- 保存: RPC `save_processmap_document(p_document, p_expected_revision)`。サーバーの revision と一致しないと `REVISION_CONFLICT` → 画面で「この端末／サーバー」を選ぶ競合ダイアログ（両方を端末に退避してから上書き）
- 端末側: localStorage にも保存（`processmap_user_<uid>_<タブID>`、未ログイン時は `processmap_guest_v1`）。2.5秒ごと・フォーカス時・オンライン復帰時に同期
- 認証: Supabase Auth（メール＋パスワード）。確認メールのリンクを画面に貼って認証完了
- 未ログインの利用者はテーブルに権限なし（`permission denied`、2026-11-20 確認）
- 文書の形（`schemaVersion: 7`）: `{appearance, processedKeys, sheets:[{id,name,stages}], activeSheetId, stages}`。sheet = `{id,name,stages,inbox,goal:{deadline},lastReview,revisions}`、stage = `{id,title,done,doneAt,star,nice,collapsed,due,note,changes,width,emphasis,tasks}`、task = `{id,text,done,doneAt,star,nice,collapsed,due,note,changes,width,emphasis,children}`。`doneAt` は完了日（`''`=過去分で不明）（孫の children は常に空）。`due` は `YYYY-MM-DD` か null。`processedKeys` 内の `__processmap_workbook_v1__:` は旧版クライアントが他シートを消さないための互換データ

## ローカルで動かす・テストする

Node.js 20以上と Playwright（Claude Code のクラウド環境には導入済み）が必要。

```bash
npm run serve
```

```bash
npm test
```

特定のテストだけを動かすときは `TEST_FILTER` で名前の一部を指定する。

```bash
TEST_FILTER='[同期]' npm test
```

## 公開（Vercel）

- プロジェクト: `processmap`（ID `prj_mgGN1KTY8uDhNAUm2P3MhVxHEovM`、チーム `kuniwork0623s-projects` / `team_i4UjPFgpGkZ0WxHNVMwTLAam`）
- プレビューは Vercel のログイン保護つき（Vercel にログインしたブラウザで開ける）

プレビューへの公開（本番には影響しない）:

```bash
scripts/deploy.sh
```

本番への公開（**本人の承認後のみ**）:

```bash
scripts/deploy.sh --prod
```

スクリプトは、プロジェクト名の照合、未コミット変更の拒否、READY待ち、アップロードしたファイルと手元のSHA1の一致確認を行う。トークンは Claude Code の「processmap」クラウド環境に api.vercel.com 用のネットワークシークレットとして保存されている（リポジトリには置かない）。ローカルで使う場合は `VERCEL_TOKEN` を環境変数で渡す。

## 切り戻し

1. 直前の正常な本番デプロイに戻す（最速）: Vercel 管理画面 → processmap → Deployments → 正常な本番デプロイ → 「Promote to Production」/「Instant Rollback」
2. Git から戻す: 正常なコミットをチェックアウトして `scripts/deploy.sh --prod`
3. 2026-11-15 時点の本番そのもの: `main` の `1905d92`

データの切り戻し: 画面のメニュー「バックアップを書き出す／読み込む」（JSON）。危険な操作（シート削除・サンプルに戻す・読み込み・競合解決）の前には、端末の localStorage に `processmap_*_backup_*` が自動保存される。

## 秘密情報の扱い

- `config.js` の publishable key は公開前提のキー。**`service_role` キーや Secret API Key は絶対にブラウザ・リポジトリに入れない**
- `.env*`、トークン、パスワード、テスト用アカウントの情報はコミットしない（`.gitignore` 済み）

## 関係のないもの（触らない）

- 常夜本体: GitHub `tokoyo`、Supabase `yyipsxwjeqjqttgvfote`、Vercel の常夜プロジェクト
- 旧HTML `ProcessMap_v0.5.5.html` や以前の Codex 引継ぎZIP は同期実装前の旧版。正本ではない
