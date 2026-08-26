import type { Metadata } from "next";
import { Card, Page, PageHeader, SectionTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "ジャービス プライバシーポリシー",
  description: "個人用の音声アシスタント「ジャービス」が扱う情報について",
};

/**
 * 「ジャービス」のプライバシーポリシー。
 *
 * Google の OAuth 同意画面が公開の URL を要求するので置いている。
 * 内容は実装に合わせて書くこと。書いてあることと実際の挙動が食い違うのは、
 * ポリシーが無いことより悪い。
 */
export default function PrivacyPage() {
  return (
    <Page>
      <PageHeader
        title="プライバシーポリシー"
        subtitle="個人用の音声アシスタント「ジャービス」について"
      />

      <div className="flex flex-col gap-4 text-sm leading-relaxed text-fg">
        <Card>
          <SectionTitle>このアプリについて</SectionTitle>
          <p className="mt-1">
            「ジャービス」は、開発者本人が自宅の PC
            で動かすために作った、個人用の音声アシスタントです。
            一般に配布しておらず、利用者は開発者本人ひとりだけです。
          </p>
        </Card>

        <Card>
          <SectionTitle>取得する情報</SectionTitle>
          <p className="mt-1">
            利用者が明示的に許可したときにかぎり、その利用者自身の Google
            アカウントから次の情報を取得します。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
            <li>カレンダーの予定（読み取りと書き込み）</li>
            <li>メールの本文と件名（読み取り）、および下書きの作成</li>
            <li>ドライブのファイル（読み取り）</li>
          </ul>
          <p className="mt-2">
            <strong className="text-gold">メールを送信する権限は取得しません。</strong>
            下書きを作るところまでで、送信は利用者が自分で行います。
          </p>
        </Card>

        <Card>
          <SectionTitle>使い道</SectionTitle>
          <p className="mt-1">
            取得した情報は、利用者本人の求めに応じて予定を調べる・予定を入れる・
            メールの内容を要約するといった、その場の用件を果たすためだけに使います。
            広告には使いません。解析サービスにも渡しません。
            他人に販売・共有することもありません。
          </p>
        </Card>

        <Card>
          <SectionTitle>保存する場所</SectionTitle>
          <p className="mt-1">
            処理は利用者の PC の中で行われ、取得した情報を保管するサーバーはありません。
            会話や覚えた事柄は、利用者の PC 上のファイルと、
            利用者自身が所有する非公開のバックアップ先にのみ保存されます。
          </p>
        </Card>

        <Card>
          <SectionTitle>外部に渡る場合</SectionTitle>
          <p className="mt-1">
            用件に応じて、必要な範囲の文章が Anthropic 社の Claude
            に送られ、そこで応答が組み立てられます。
            予定やメールの内容について尋ねた場合、その内容が送られることがあります。
          </p>
          <p className="mt-2 text-fg-muted">
            これ以外に、取得した情報を第三者へ渡すことはありません。
          </p>
        </Card>

        <Card>
          <SectionTitle>やめるとき</SectionTitle>
          <p className="mt-1">
            アクセスの許可は、Google アカウントの
            「セキュリティ」→「サードパーティ製アプリとの連携」からいつでも取り消せます。
            取り消すと、このアプリは以後 Google の情報を読めなくなります。
          </p>
          <p className="mt-2 text-fg-muted">
            PC 上に保存された情報は、利用者が自分で削除できます。
          </p>
        </Card>

        <Card>
          <SectionTitle>問い合わせ</SectionTitle>
          <p className="mt-1">
            開発者への連絡は{" "}
            <a
              className="text-gold underline"
              href="https://github.com/youlukeito3-svg"
              target="_blank"
              rel="noreferrer"
            >
              github.com/youlukeito3-svg
            </a>{" "}
            から。
          </p>
        </Card>

        <p className="pb-4 text-center text-xs text-fg-muted">最終更新: 2026年8月26日</p>
      </div>
    </Page>
  );
}
