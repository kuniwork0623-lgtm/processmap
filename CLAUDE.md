# CLAUDE.md — ProcessMap 保守ルール

ユーザーが「ProcessMapのここを修正して」と言ったら、このリポジトリが正本。詳細は README.md。

## 進め方（毎回この順）

1. ブランチを切る（`main` 直接は不可）: `git checkout -b fix/<内容>-<YYYYMMDD>`
2. 編集する
   - 画面・操作 → `index.html`（CSSは `<style>`、アプリは `<script>` 内の IIFE）
   - ログイン・同期 → `sync.js` の**末尾 約7KB**（`var oa=ie(()=>{` 以降）だけ。前半は Supabase ライブラリのバンドルなので触らない。主な名前: `Ie`=同期, `kt`=ログイン状態の変化, `Pe`=端末保存, `Ct`=古い端末コピーの掃除, `N`=状態表示, `B`=未同期フラグ, `G`=revision
3. テストを追加・更新して実行: `npm test`（全件成功が必須。失敗をテスト側の都合で消さない）
4. 見た目の変更はスクリーンショットで PC(1440×900) とスマホ(390×844) の両方を確認
5. コミットして push: `git push -u origin <branch>`
6. プレビュー公開: `scripts/deploy.sh` → 出力の URL とテスト結果をユーザーに報告
7. **本番公開はユーザーが「本番反映して」と言ってから**: `main` にマージ → `scripts/deploy.sh --prod` → https://processmap-green.vercel.app で表示と動作を確認

## 守ること

- データ互換: 既存の工程表を読めなくする変更をしない。項目を増やすときは `normalize()` で欠けていても動くようにし、不正値は捨てる（例外で全体を壊さない）。保存済みの空欄タスクは消さない
- 同期: `REVISION_CONFLICT` で黙って上書きしない。端末保存の失敗でサーバー同期を止めない。未同期（`dirty:true`）の端末コピーは消さない
- テストは Supabase を模擬サーバーで置き換える（`tests/run.mjs` の `mockSupabase`）。**本番DBへの書き込み・削除・テーブル/RLS/関数の変更は、内容を提示してユーザーの承認を得てから**
- 秘密情報（トークン、`service_role`、パスワード、`.env`）を表示・コミット・ブラウザ埋め込みしない。`config.js` の publishable key だけは公開してよい
- Vercel は既存プロジェクト `prj_mgGN1KTY8uDhNAUm2P3MhVxHEovM` だけを使う。新規プロジェクトを作らない。`vercel link` で空フォルダを紐付けて本番デプロイしない
- 常夜本体（GitHub `tokoyo`、Supabase `yyipsxwjeqjqttgvfote`）には一切触れない
- デザインは現状維持が原則。大規模リファクタリングをしない
- 用語: メインタスク（一番上の大きいカード）→ 子タスク → 孫タスク。4階層目は作らない

## 環境メモ（Claude Code クラウド）

- 環境「processmap」で動かす（許可ホスト: processmap-green.vercel.app, api.vercel.com, vercel.com, xgeviftkyrxhqbpgpfea.supabase.co）。Vercel トークンは api.vercel.com 用のネットワークシークレットとして自動付与される。コマンドにはダミー値 `proxy-injected` を渡せばよい
- Playwright は導入済み（`/opt/node-tools/node_modules/playwright`）。`playwright install` はしない
- プレビュー URL は Vercel ログイン保護つきでクラウドからは開けない → 画面テストはローカルで行い、デプロイ後は `deploy.sh` のハッシュ照合で同一性を確認する
