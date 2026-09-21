# LoveGod 遠隔ドリンク注文サイト

キャスト選択 → ドリンク選択 → 注文 → 決済案内（PayPay / 銀行振込）の流れで
お客様から遠隔ドリンクの注文を受け付け、管理画面（ID/パスワードでログイン）から
注文状況を確認・更新できるWebアプリです。

## 構成

- Node.js + Express（サーバー）
- データベースは [Turso](https://turso.tech)（無料のクラウドSQLite）を使用。
  Render.comなどの「無料プランには永続ディスクが無い」ホスティングでも、
  データが消えずに残ります。TURSO_DATABASE_URL を設定しなければローカルファイル
  （data.sqlite）で動くので、自分のPCでの確認時はTursoの用意は不要です。
- フロントエンドはプレーンなHTML/CSS/JS（フレームワーク不要）

```
lovegod-order-app/
├── server.js          # エントリーポイント
├── db/init.js         # DB接続・テーブル定義（Turso / ローカルファイル両対応）
├── routes/
│   ├── public.js       # お客様向けAPI（キャスト・ドリンク一覧、注文送信）
│   └── admin.js        # 管理画面向けAPI（ログイン必須）
├── public/
│   ├── index.html      # お客様向け注文ページ
│   ├── admin/           # 管理画面
│   └── css/js
└── .env.example        # 環境変数のテンプレート
```

## ローカルで動作確認する

```bash
cd lovegod-order-app
npm install
cp .env.example .env    # 中身を自分用に編集（下記参照）
npm start
```

ブラウザで以下を開く：

- お客様向け注文ページ： http://localhost:3000/
- 管理画面： http://localhost:3000/admin

ローカル確認時は `TURSO_DATABASE_URL` を空のままでOKです（自動でdata.sqliteという
ファイルが作られます）。

## .env の設定項目

| 変数 | 説明 |
|---|---|
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | 無料のクラウドDB「Turso」の接続情報（下記「本番公開の手順」参照）。空のままならローカルファイルを使用 |
| `ADMIN_USERNAME` | 管理画面の初回ログインID（初回起動時にこの内容でアカウントが自動作成されます） |
| `ADMIN_PASSWORD` | 管理画面の初回パスワード（ログイン後、管理画面の「アカウント」タブからいつでも変更可能） |
| `SESSION_SECRET` | セッション暗号化用の文字列。適当な長い英数字にしてください |
| `PORT` | サーバーのポート番号。多くのホスティングサービスでは自動で上書きされるので気にしなくてOK |

**注意**: `ADMIN_USERNAME`/`ADMIN_PASSWORD` は「アカウントが存在しないときだけ」使われる初期値です。
一度アカウントができた後に.envを書き換えても反映されません。パスワードは管理画面から変更してください。

## 初期データについて

初回起動時に、動作確認用のサンプルキャスト2名・サンプルドリンク3種類が自動で入ります。
実際のキャスト名・ドリンクメニューは管理画面の「キャスト」「ドリンク」タブから追加・編集・非表示にできます。
PayPay IDや振込先口座は「決済設定」タブから設定してください（初期値はダミーです。必ず変更してください）。

## 本番公開の手順（無料構成: Render.com + Turso）

### 1. Tursoでデータベースを作る（無料）

1. https://turso.tech にアクセスしてアカウント作成（GitHubアカウントでログインできます）
2. ダッシュボードで「Create Database」→ 好きな名前を付けて作成
3. 作成したデータベースの画面で接続情報を確認：
   - **Database URL**（`libsql://...` から始まる文字列）
   - **Auth Token**（「Create Token」のようなボタンを押して発行）
4. この2つを、Renderの環境変数に設定します（次の手順）

### 2. Render.comにデプロイする

1. このフォルダをGitHubリポジトリにアップロードする（`.env`ファイルは絶対に含めない）
2. Render.com で「New +」→「Web Service」→ 対象リポジトリを選択
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Instance Type: **Free**のままでOK（永続ディスクが不要になったため）
6. Environment Variables に以下を登録：
   - `TURSO_DATABASE_URL` = さきほど確認したDatabase URL
   - `TURSO_AUTH_TOKEN` = さきほど発行したAuth Token
   - `ADMIN_USERNAME` = 自分の好きなID
   - `ADMIN_PASSWORD` = 自分の好きなパスワード
   - `SESSION_SECRET` = 適当な長い文字列
7. 「Create Web Service」を押すとデプロイが始まります。2〜5分ほどで
   `https://（名前）.onrender.com` というURLが発行されます。これが公開URLです。

**Render無料プランの制限**: 15分アクセスが無いとサーバーが一旦休止し、次のアクセス時に
再起動（1分ほど）が入ります。注文データ自体はTurso側に保存されているので消えませんが、
「開いた瞬間だけ少し待たされる」ことがある点はご了承ください。気になる場合は月7ドルの
Starterプランにアップグレードすると常時起動になります。

## LINE通知を有効にする（任意）

新しい注文が入ったときに、LINEに通知が届くようにできます。無料の範囲（月200通まで）で使えます。

1. https://entry.line.biz/start/jp/ からLINE公式アカウントを作成（無料）
2. 作成したアカウントの管理画面（LINE Official Account Manager）→「設定」→「Messaging API」タブを開き、Messaging APIを有効化
3. 同じ画面で「チャネルアクセストークン（長期）」を発行してコピー
4. 「チャネルシークレット」も同じ画面（もしくはLINE Developersコンソール）でコピー
5. Renderの環境変数に追加：
   - `LINE_CHANNEL_ACCESS_TOKEN` = さきほどのアクセストークン
   - `LINE_CHANNEL_SECRET` = さきほどのチャネルシークレット
6. 同じMessaging API設定画面の「Webhook URL」に `https://（あなたの公開URL）/api/line/webhook` を入力し、「Webhookの利用」をオンにする
7. スマホのLINEアプリで、作成した公式アカウントを友だち追加し、何かひとこと送る（これで通知の宛先として自分のLINEが自動登録されます）
8. 応答メッセージ機能は使わないので、Official Account Managerの「応答設定」で「Webhook」をオン、「応答メッセージ」はオフにしておくと余計な自動返信が来ません

設定後、注文が入るたびにキャスト名・ドリンク名・お客様名がLINEに届きます。

## 今後の拡張候補（今回のバージョンには含まれていません）

- オンライン決済（Stripeなど）の自動連携・自動入金確認
- キャスト写真のアップロード機能（現状はURL指定のみ）

必要になったタイミングで声をかけてください。
