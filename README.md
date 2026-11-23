# ProcessMap

制作の工程表アプリ。メインタスク → 子タスク → 孫タスクの3階層で工程を並べ、手動で完了をチェックして進み具合を把握する。AIが作ったスケジュールを箇条書きのまま一括登録できる。

- 公開URL: https://processmap-green.vercel.app
- ソース: このリポジトリ（`kuniwork0623-lgtm/processmap`）。**唯一の正本**
- 本番の基準点: `main` の最初のコミット `1905d92` = Vercel本番デプロイ `dpl_7LDsZ8dQGE2PLYa5jvZS4Bea4XTT`（2026-11-15）をそのまま取り込んだもの

## マインドマップ

下部の「＋」から「マインドマップ」を選ぶと、中心テーマをすぐ入力できます。枝は自動で配置されます。PCでは Tab で枝、Enter で同列のトピックを追加します。スマホでは「＋ 枝」「＋ 同列」を使えます。

詳しい内容は選択したトピックの「メモ」に書けます。「一覧・検索」では折りたたんだトピックやメモの本文も探せます。検索結果を選ぶと、その枝を開いて対象のトピックを表示します。「全体表示」は開いている枝を画面に収めます。PCではカードにカーソルを合わせると、スマホではカードを選択すると、枝のつまみ「⠿」が表示されます。つまみをドラッグすると、その下につながる枝ごと好きな位置に移せます。全体表示からカードをタップすると、読みやすい大きさで編集できます。シート設定の「自動配置に戻す」で配置をリセットできます。つなぎ先の変更はトピックの操作「⋯」にあります。

削除するカードを選択し、上部の「削除」を押します。PCではカード名の編集をEscで終え、Deleteキーでも削除確認を開けます。子があるカードは、子を残すか枝ごと削除するか選べます。削除直後は「元に戻す」で復元できます。

FreeMind形式のマインドマップは、下部の「＋」→「.mm を取り込む」から追加できます。ファイルを選び、トピック数・階層数・主枝を確認して「新しいシートに追加」を押します。階層、順番、名前、メモ、折りたたみ、主枝の左右、囲み枠と下線の違いを引き継ぎます。間隔は自動で配置されます。装飾付きの文字やメモはテキストとして取り込みます。上限は1ファイル2 MB、500トピック、中心を含めて33階層です。

マインドマップは工程表と同じ自動保存・同期・JSONバックアップを使います。枝のデータは `processedKeys` の予約項目 `__processmap_mindmaps_v1__:` に入ります。旧版アプリの工程表の読み書きでも見えないマインドマップが保持されるよう、工程表の `sheets`・`stages` はそのまま読み書きできる形で保存します。

## 管理のしくみ（秘書）

計画は必ず崩れる前提で、ツール側が次のルールを守らせる。

1. **予定が崩れたら残りの作業を整理する** — 今週の作業時間、着手順、締切を見直す。後回しにできる項目があれば「あったら良い」に回す
2. **思いついたら「あとで箱」** — 画面左下の「💡 思いついた」から、全シート共通の箱にメモする。Enter／Alt＋Enterで改行し、保存ボタンまたはCtrl＋Enter（Macは⌘＋Enter）で1件として保存。保存済みのメモは各行の「編集」から修正できる。以前のメモを探すには、入力したブラウザーでログインし、「端末内のメモを探す」を開く
3. **細かく決めるのは今週だけ** — 「★今週」は最大5個
4. **週1回5分の見直し** — 終わったものをチェック → あとで箱の仕分け → 間に合うか確認 → 今週の★を選ぶ

工程表では画面左下のベルから**秘書**を開く。確認が必要なときはベルに印が付き、開くと次の行動、今週の★、進捗の見込みを確認できる。

**予定を立て直す**では、必須の残り件数、直近の完了ペース、着手候補を確認する。すべてのタスクが必要なときは「全タスクを残してAIに相談」で、今週使える作業時間を添えた相談文を作れる。この相談から取り込む変更は未完了項目の期日・順番・今週の★。締切そのものはシートの設定で変更できる。
**AIに相談**は状況と工程表（#ID・[x]・★・（あったら良い）付き）を相談文にしてコピーし、AIの返答の「---工程表---」以降を取り込む。完了済みは名前・期日・完了を変えず、AIの案から消えても残す。変わった項目は色付きでハイライトされ、見直し・相談の内容は「変更履歴」に残る。
週の見直しでは、行き先を選んだメモを表示中の工程表に仕分ける。AIの相談文には、「全シート共通のあとで箱を相談文に含める」を選んだ場合にメモを追加する。
完了見込みは、最近14日間の完了数（完了日 `doneAt`）を使った件数ベースの目安。

## 操作（主なもの）

| 操作 | 方法 |
|---|---|
| カードのメニュー（孫追加・完了・期日/メモ・移動・枠線・削除） | カードにマウスを乗せて「⋯」、または右クリック、選択中に Shift+F10 |
| 名前の表示幅 | カードの「⋯」→「幅・折り返し…」で指定。工程表の右端のつまみは、PCではカーソルを合わせるか選択したとき、スマホではカードを選択したときに表示 |
| 自動折り返し | 画面下部の「折り返しなし」で、開いているシート全体を切り替え |
| 名前の途中で改行 | Alt（Option）＋Enter。自動折り返しの設定にかかわらず表示 |
| 一段下に追加 | Tab（メイン→子、子→孫） |
| 孫を子に上げる | Shift+Tab |
| 次のタスク | Enter |
| 完了の切り替え | Ctrl（⌘）+Enter |
| タスク間の移動 | ↑ / ↓ |
| 並べ替え | ドラッグ（文字の上からでも可）、Ctrl+Shift+↑↓ |
| 編集終了 / 削除 | Esc / 選択中に Delete、空のタスクで Backspace |
| ズーム | Ctrl（⌘）+ホイール、ピンチ、右下の＋− |

幅を空欄にすると自動幅に戻ります。固定幅のカードで「折り返しなし」にすると、長い名前は表示幅に合わせて省略されます。名前欄を選んで横に移動すると全文を確認できます。マインドマップのシート全体で「折り返しなし」を有効にすると、移動済み・固定幅のカードも、最も長い行が収まるように一時的に広がります。設定を戻すと元の幅と配置に戻ります。

## 構成

ビルド不要の静的サイト。Vercel にはファイルをそのままアップロードしている（Git連携なし）。

| ファイル | 役割 |
|---|---|
| `index.html` | 画面のすべて（CSS + アプリ本体のJS）。タスク編集・Tab追加・URLリンク・ドラッグ・ズーム・配色・シート・期日/メモ・AI取り込み・AIスケジュール登録 |
| `sync.js` | Supabase JS ライブラリを同梱したバンドル（約180KB）。**ProcessMap固有のログイン・同期処理は末尾の約7KB**（`var oa=ie(()=>{...` 以降） |
| `config.js` | Supabase の URL と **publishable key（公開用キー）**。ブラウザに出してよいキー |
| `favicon.svg` / `apple-touch-icon.png` | サイトのアイコン（タブ用／iPhoneホーム画面用） |
| `vercel.json` | セキュリティヘッダーと `Cache-Control: no-store` |
| `tests/run.mjs` | Playwright 回帰テスト（PC 1440×900 / スマホ 390×844）。Supabase は**模擬サーバー**で置き換え、本番DBに触れない |
| `tests/serve.mjs` | ローカル確認用の静的サーバー |
| `scripts/deploy.sh` | Vercel へのデプロイ（プレビュー／本番） |

### データと同期

- 保存先: Supabase プロジェクト `processmap`（ref `xgeviftkyrxhqbpgpfea`）のテーブル `public.processmap_documents`（1ユーザー1行。列 `user_id`, `document`(JSON), `revision`）
- 読み込み: `select document,revision where user_id = 自分`
- 保存: RPC `save_processmap_document(p_document, p_expected_revision)`。サーバーの revision と一致しないと `REVISION_CONFLICT` → 画面で「この端末／サーバー」を選ぶ競合ダイアログ（両方を端末に退避してから上書き）
- 端末側: localStorage の `processmap_user_<uid>_<タブID>` にも保存。2.5秒ごと・フォーカス時・オンライン復帰時に同期。旧版のゲストデータは `processmap_guest_v1` に残る場合がある
- 認証: Supabase Auth（メール＋パスワード）。確認メールのリンクを画面に貼って認証完了
- 未ログインの利用者はテーブルに権限なし（`permission denied`、2026-11-20 確認）
- 文書の形（`schemaVersion: 7`）: `{appearance, processedKeys, sheets:[{id,name,stages}], activeSheetId, stages}`。sheet = `{id,name,stages,goal:{deadline},lastReview,revisions}`、stage = `{id,title,done,doneAt,star,nice,collapsed,due,note,changes,width,emphasis,tasks}`、task = `{id,text,done,doneAt,star,nice,collapsed,due,note,changes,width,emphasis,children}`。`doneAt` は完了日（`''`=過去分で不明）（孫の children は常に空）。`due` は `YYYY-MM-DD` か null。`processedKeys` 内の `__processmap_workbook_v1__:` は旧版クライアントが他シートを消さないための互換データ。共通のあとで箱は `__processmap_inbox_v1__:` に保存し、旧版のシート別 `inbox` にあるメモも読み込む

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

## AIから工程表の進捗を読む

MCP接続先は `https://xgeviftkyrxhqbpgpfea.supabase.co/functions/v1/processmap-progress` です。接続後、ChatGPTまたはClaude Codeから、シート名を指定して最新の進捗を取得できます。取得結果には更新日時とリビジョンが付きます。共有する範囲は工程表の名前、階層、完了、期日と優先度です。ProcessMapの「⋯」→「AIの読み取り連携」から、接続相手と許可の解除を管理できます。

ChatGPTがアカウント確認用のメールアドレスを求める場合や、AI側が読み取り接続の更新を求める場合は、許可する前に同意画面に表示されます。

### 連携を有効にする順序

1. 既存のProcessMap Vercelプロジェクトに同意画面 `/oauth/consent` をデプロイします。
2. ProcessMap専用Supabaseに `supabase/migrations/20261122000100_processmap_progress_oauth.sql` を適用し、Edge Function `processmap-progress` をデプロイします。関数の中で署名・発行元・宛先・OAuthセッションを検証します。
3. Supabase Authで `pg-functions://postgres/processmap_connector/access_token` をカスタムアクセストークンフックに設定します。先に通常ログインが動くことを確認してから、OAuth 2.1サーバーと動的クライアント登録を有効にします。Authorization Pathは `/oauth/consent` です。
4. Claude CodeではHTTPのMCPサーバーとして接続します。ChatGPTではアカウントにカスタムMCPの権限がある場合に、OAuth接続として追加します。いずれもProcessMapのアカウントでログインして許可します。

フックはOAuthトークンを専用の権限なしロールに切り替え、MCP専用の宛先へ束縛します。このロールをPostgRESTの `authenticator` へ付与しないでください。関数は本人の文書だけを取得し、工程表の必要項目に絞って返します。既存のログイン用トークンは通常の保存に使います。DBの既存テーブル、ポリシー、行に対するSQL変更はありません。

関数のテストは `deno test --config supabase/functions/processmap-progress/deno.json supabase/functions/processmap-progress/handler_test.ts` で実行できます。

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
