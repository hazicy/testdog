import Link from 'next/link';
import { MarketingDemo } from '@/components/MarketingDemo';

const faqs = [
  [
    '适合哪些测试场景？',
    '适合登录、表单提交、页面导航等具有明确操作步骤和预期结果的网页流程。复杂的数据准备和定制逻辑可以结合现有测试代码使用。',
  ],
  [
    '需要编写 Playwright 脚本吗？',
    '编写用例时只需描述操作步骤与预期结果。CaseForge 会组织执行计划，并通过 Playwright 操作真实浏览器。',
  ],
  [
    '如何判断测试是否通过？',
    '执行器会在操作后重新观察页面，将实际页面状态与预期结果比对。你可以在执行记录中查看步骤、截图和断言结果。',
  ],
  [
    '可以在本地运行吗？',
    '可以。配置数据库和模型服务后即可在本地运行，也可以通过 API 提交用例并发起测试。',
  ],
];

export default function Home() {
  return (
    <div className="bg-page text-ink text-sm leading-relaxed [--accent:#b84c2e]">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 bg-white p-3 focus:not-sr-only"
      >
        跳转到主内容
      </a>
      <header className="border-b border-page-line bg-page">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
          <Link
            href="/"
            aria-label="CaseForge 首页"
            className="text-xl font-semibold tracking-tight"
          >
            caseforge<span className="text-[#b84c2e]">.</span>
          </Link>
          <nav
            aria-label="页面导航"
            className="ml-auto hidden items-center gap-7 text-[#64665d] sm:flex"
          >
            <a href="#workflow" className="hover:text-ink">
              使用流程
            </a>
            <a href="#faq" className="hover:text-ink">
              常见问题
            </a>
          </nav>
          <Link href="/cases" className="ws-button">
            进入工作台 <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section className="mx-auto max-w-6xl px-5 pb-14 pt-16 sm:px-8 sm:pt-24">
          <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
            <div>
              <p className="mb-5 text-sm font-medium text-[#9e3f25]">
                浏览器测试，从清晰的描述开始
              </p>
              <h1 className="text-[28px] font-semibold leading-[1.4] tracking-tight min-[440px]:text-4xl sm:text-[40px] lg:text-[44px] xl:text-5xl">
                用自然语言编写测试，
                <br />
                用页面证据验证结果。
              </h1>
              <Link href="/cases" className="ws-button primary mt-8">
                新建第一个测试 <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="pt-1 lg:pt-11">
              <p className="max-w-md text-base leading-8 text-[#64665d]">
                写下操作步骤和预期结果，CaseForge
                会生成执行计划，在真实浏览器中完成测试，并保留可追溯的执行记录。
              </p>
              <p className="mt-5 text-sm text-[#73766b]">
                自然语言用例 · Playwright 执行 · 截图与断言记录
              </p>
            </div>
          </div>
        </section>
        <section
          id="workflow"
          aria-labelledby="workflow-title"
          className="mx-auto max-w-6xl scroll-mt-8 px-5 pb-20 sm:px-8"
        >
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="workflow-title" className="text-lg font-semibold">
              从测试描述到执行结果
            </h2>
            <p className="text-sm text-[#73766b]">选择一个示例，查看操作与验证过程</p>
          </div>
          <MarketingDemo />
          <div className="mt-10 grid gap-7 border-b border-page-line pb-12 sm:grid-cols-3 sm:gap-10">
            {[
              [
                '描述用户路径',
                '填写网站地址、操作步骤与预期结果。用例保存在工作区，方便持续维护。',
              ],
              [
                '在浏览器中执行',
                '根据当前页面组织操作，处理导航、表单与弹窗，记录每一步执行状态。',
              ],
              ['检查结果与证据', '查看断言、截图与执行日志，定位失败步骤，再验证修复。'],
            ].map(([title, description], index) => (
              <div key={title}>
                <p className="mb-3 text-xs font-medium text-[#9e3f25]">步骤 {index + 1}</p>
                <h3 className="text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#64665d]">{description}</p>
              </div>
            ))}
          </div>
        </section>
        <section
          id="faq"
          aria-labelledby="faq-title"
          className="mx-auto grid max-w-6xl gap-8 px-5 pb-20 sm:px-8 md:grid-cols-[1fr_2fr] md:gap-16"
        >
          <h2 id="faq-title" className="text-2xl font-semibold tracking-tight">
            常见问题
          </h2>
          <div className="border-t border-page-line">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group border-b border-page-line">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
                  {question}
                  <span aria-hidden="true" className="text-lg text-[#73766b] group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-5 pr-6 leading-7 text-[#64665d]">{answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-page-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-7 text-xs text-[#73766b] sm:px-8">
          <span>© {new Date().getFullYear()} CaseForge</span>
          <Link href="/cases" className="hover:text-ink">
            进入测试工作台 →
          </Link>
        </div>
      </footer>
    </div>
  );
}
