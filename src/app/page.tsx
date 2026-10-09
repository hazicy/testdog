import Link from 'next/link';
import { MarketingDemo } from '@/components/marketing/MarketingDemo';
import { MarketingMotion } from '@/components/marketing/MarketingMotion';

const containerClassName =
  'w-[min(1200px,_calc(100%_-_112px))] mx-auto min-[1600px]:w-[min(1320px,_calc(100%_-_160px))] max-[1100px]:w-[calc(100%_-_64px)] max-[800px]:w-[calc(100%_-_40px)] max-[540px]:w-[calc(100%_-_32px)]';
const eyebrowClassName =
  'flex items-center gap-2.5 font-mono text-[10px] leading-[1.5] tracking-[1px] text-page-muted max-[540px]:text-[8px] max-[540px]:tracking-[0.7px]';
const headingClassName =
  'mt-[19px] text-[39px] font-[550] leading-[1.4] tracking-[-1.4px] max-[800px]:text-[32px] max-[540px]:text-[29px] max-[540px]:leading-[1.45] max-[540px]:tracking-[-1px]';

const features = [
  {
    number: '01',
    appearance:
      'text-[32px] text-[#656f50] border-[#d5d8c6] bg-[repeating-linear-gradient(0deg,transparent_0_6px,#dde0d140_6px_7px),linear-gradient(#eef0e5,#eef0e5)]',
    tag: 'TEXT COMPILER',
    title: ['描述目标，', '无需编写脚本。'],
    description:
      '把操作步骤和预期结果写成自然语言。CaseForge 将你的描述编译为结构化计划，组织任务、依赖与条件分支。',
    symbol: 'Aa',
    note: '自然语言 → 结构化计划',
  },
  {
    number: '02',
    appearance: 'text-[#e57751] bg-[#f9ece4] border-[#ead4c4] text-[45px]',
    tag: 'BROWSER EXECUTION',
    title: ['真实浏览器，', '真实用户路径。'],
    description:
      '由 Playwright 驱动浏览器，结合页面观察规划下一步操作。导航、弹窗、新标签页，都在同一个测试会话中流转。',
    symbol: '↗',
    note: '页面观察 → 操作执行',
  },
  {
    number: '03',
    appearance: 'text-[38px] text-[#656f50] border-[#d5d8c6] bg-[#f0f0e9]',
    tag: 'EVIDENCE FIRST',
    title: ['用页面证据，', '回答是否通过。'],
    description:
      '断言基于当前页面的实际状态。将操作与验证分开，让测试结果回到你设定的预期，而不是模型的猜测。',
    symbol: '✓',
    note: '预期结果 → 页面断言',
  },
];

const faqs = [
  [
    'CaseForge 适合什么场景？',
    '适合将清晰的网页操作步骤和预期结果转换为自动化测试，例如登录流程、表单提交、页面导航与条件分支。需要复杂数据准备或高度定制逻辑的场景，可以结合现有测试代码使用。',
  ],
  [
    '需要了解 Playwright 才能使用吗？',
    '编写用例不需要掌握 Playwright API。你只需描述操作步骤和预期结果，CaseForge 会编译计划并驱动浏览器。部署和接入时仍需要配置模型服务与数据库。',
  ],
  [
    '它如何判断测试是否通过？',
    '执行器在操作后重新观察页面，断言只读取当前页面证据，并与用例中的预期结果比对。断言不会通过额外操作来补救失败。',
  ],
  [
    '可以在本地运行或通过 API 接入吗？',
    '可以。项目使用 Next.js、PostgreSQL、DeepSeek 与 Playwright，支持本地运行。通过 POST /api/runs 提交用例文本和目标 URL，即可发起执行。当前支持 record 模式，replay 尚未实现。',
  ],
];

export default function Home() {
  return (
    <MarketingMotion className="motion-safe:[&_[data-motion=pending]]:opacity-0 motion-reduce:[&_*]:transition-none bg-page text-ink text-[14px] leading-[1.6] [&_a]:no-underline [&_button]:[-webkit-tap-highlight-color:transparent] [&_a]:[-webkit-tap-highlight-color:transparent] [&_summary]:[-webkit-tap-highlight-color:transparent] [&_:focus-visible]:outline-brand [&_section[id]]:scroll-mt-25 [&_h1[id]]:scroll-mt-25">
      <a
        className="fixed left-5 -top-25 z-100 py-3 px-5 bg-ink text-white focus:top-3"
        href="#main-content"
      >
        跳转到主内容
      </a>
      <header className="sticky top-0 z-40 border-b border-b-page-line bg-[rgba(250,_249,_246,_0.94)] backdrop-blur-lg">
        <div
          className={`${containerClassName} h-21 flex items-center justify-between gap-8 max-[800px]:h-18 max-[540px]:gap-3`}
        >
          <Link
            className="inline-flex items-center text-ink text-[28px] font-bold tracking-[-1.6px] leading-none max-[800px]:text-[25px] max-[540px]:text-[23px]"
            href="/"
            aria-label="CaseForge 首页"
          >
            <span
              className="inline-grid place-items-center w-7 h-[29px] mr-[11px] font-mono text-[35px] font-semibold -rotate-45 max-[540px]:w-[21px] max-[540px]:mr-2 max-[540px]:text-[30px]"
              aria-hidden="true"
            >
              ↳
            </span>
            caseforge<span className="text-brand">.</span>
          </Link>
          <nav
            className="flex gap-[34px] ml-auto mr-11 [&_a]:text-[#5c5e55] [&_a]:text-[13px] [&_a]:transition-colors [&_a]:duration-200 [&_a:hover]:text-brand max-[1100px]:gap-6 max-[1100px]:mr-5 max-[800px]:hidden"
            aria-label="页面导航"
          >
            <a href="#capabilities">产品能力</a>
            <a href="#workflow">工作原理</a>
            <a href="#faq">常见问题</a>
          </nav>
          <Link
            className="flex items-center gap-[30px] border border-[#bcbdb4] py-[9px] px-[17px] text-ink text-[12px] transition duration-200 hover:bg-[#efeee7] hover:border-ink max-[540px]:py-2 max-[540px]:px-3 max-[540px]:text-[10px] max-[540px]:gap-[15px]"
            href="/cases"
          >
            进入工作台 <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>

      <main id="main-content">
        <section
          className={`relative border-x border-x-page-line ${containerClassName}`}
          aria-labelledby="hero-title"
        >
          <div className="flex justify-between items-center py-[22px] px-[30px] border-b border-b-page-line font-mono text-[10px] leading-[normal] tracking-[0.8px] text-page-muted [&_>_span:first-child]:flex [&_>_span:first-child]:items-center [&_>_span:first-child]:gap-[9px] max-[800px]:py-[18px] max-[800px]:px-5 max-[800px]:text-[8px] max-[540px]:px-4 max-[540px]:tracking-[0.1px]">
            <span>
              <i className="motion-safe:animate-pulse status-dot inline-block flex-none h-1.5 w-1.5 rounded-full bg-[#78a576]" />{' '}
              BUILT FOR THE WAY YOU TEST
            </span>
            <span className="max-[540px]:hidden">[ CASEFORGE / 001 ]</span>
          </div>
          <div className="grid grid-cols-[1.15fr_1fr] min-h-[598px] min-[1600px]:min-h-[640px] max-[800px]:grid-cols-1">
            <div className="pt-[70px] pr-[30px] pb-9 pl-[46px] relative z-2 min-[1600px]:pl-15 min-[1600px]:pt-22 max-[1100px]:pl-7 max-[1100px]:pr-[15px] max-[800px]:pt-[49px] max-[800px]:px-7 max-[800px]:pb-[35px] max-[540px]:pt-[41px] max-[540px]:px-5 max-[540px]:pb-[30px]">
              <p data-entrance="0" className={eyebrowClassName}>
                LESS SCRIPT. MORE CONFIDENCE.
              </p>
              <h1
                data-entrance="90"
                id="hero-title"
                className="mt-6 mb-[25px] text-[clamp(46px,4.6vw,66px)] font-[650] leading-[1.24] tracking-[-3px] min-[1600px]:text-[72px] max-[1100px]:text-[49px] max-[1100px]:tracking-[-2px] max-[800px]:text-[58px] max-[540px]:text-[clamp(37px,10.5vw,55px)] max-[540px]:tracking-[-1.8px] max-[540px]:mt-[23px]"
              >
                用自然语言，
                <br />
                让测试
                <span className="text-brand motion-safe:bg-[linear-gradient(100deg,#cf4f2e_0%,#f16b43_35%,#ffb38a_50%,#f16b43_65%,#cf4f2e_100%)] motion-safe:bg-[length:220%_100%] motion-safe:bg-clip-text motion-safe:text-transparent motion-safe:animate-title-shine">
                  发生<span className="ml-1">.</span>
                </span>
              </h1>
              <p
                data-entrance="180"
                className="text-[#77786f] text-[15px] leading-[1.95] max-[800px]:text-[14px] max-[540px]:text-[12px]"
              >
                把重复操作交给 AI，把专注留给创造。
                <br />
                从一句测试描述，到一次真实的浏览器验证。
              </p>
              <div
                data-entrance="270"
                className="flex gap-[17px] items-center mt-[33px] max-[1100px]:gap-1.5 max-[540px]:mt-[26px] max-[540px]:gap-2"
              >
                <Link
                  className="inline-flex items-center justify-between gap-9 py-[15px] px-[23px] min-h-13 text-[13px] font-medium transition duration-200 hover:-translate-y-0.5 [&_span]:text-[18px] [&_span]:leading-none [&_span]:transition-transform [&_span]:duration-300 hover:[&_span]:translate-x-1 hover:[&_span]:-translate-y-0.5 max-[1100px]:gap-[22px] max-[1100px]:px-[18px] max-[540px]:text-[11px] max-[540px]:py-[13px] max-[540px]:px-[15px] max-[540px]:min-h-[46px] max-[540px]:gap-5 bg-brand text-[#fff] hover:bg-[#dc5c36]"
                  href="/cases"
                >
                  开始构建用例 <span aria-hidden="true">↗</span>
                </Link>
                <a
                  className="inline-flex items-center justify-between py-[15px] min-h-13 text-[13px] font-medium transition duration-200 hover:-translate-y-0.5 [&_span]:text-[18px] [&_span]:leading-none [&_span]:transition-transform [&_span]:duration-300 hover:[&_span]:translate-x-1 hover:[&_span]:-translate-y-0.5 max-[1100px]:gap-[22px] max-[1100px]:px-[18px] max-[540px]:py-[13px] max-[540px]:min-h-[46px] text-[#606258] px-3 gap-[18px] hover:bg-[#efeee8] max-[540px]:px-[5px] max-[540px]:gap-2.5 max-[540px]:text-[10px]"
                  href="#workflow"
                >
                  看看它如何工作 <span aria-hidden="true">↓</span>
                </a>
              </div>
              <div
                data-entrance="360"
                className="flex gap-3 items-center mt-13 text-[#85867b] text-[10px] whitespace-nowrap max-[1100px]:gap-2 max-[1100px]:text-[9px] max-[800px]:mt-8 max-[540px]:text-[8px] max-[540px]:gap-[7px] max-[540px]:[&_.tiny-cross]:hidden"
              >
                <span className="tiny-cross text-brand text-[16px] font-mono">+</span> 自然语言驱动{' '}
                <span className="inline-block h-[9px] w-px bg-[#d3d3c9]" /> Playwright 执行{' '}
                <span className="inline-block h-[9px] w-px bg-[#d3d3c9]" /> 页面证据验证
              </div>
            </div>
            <div
              data-hero-art
              data-entrance="180"
              className="relative min-w-0 overflow-hidden border-l border-l-page-line [background:radial-gradient(ellipse_at_50%_50%,_#ecece2_0,_transparent_65%)] max-[800px]:h-[350px] max-[800px]:border-l-0 max-[800px]:border-t max-[800px]:border-t-page-line max-[540px]:h-[300px]"
              aria-hidden="true"
            >
              <div className="absolute z-2 font-mono text-[9px] leading-[normal] text-[#8b8b80] tracking-[0.4px] max-[540px]:text-[7px] top-[29px] left-[26px] max-[800px]:top-[18px]">
                FIG. 01 — THE TESTING ENGINE
              </div>
              <div className="art-grid" />
              <div className="pointer-events-none absolute left-[8%] right-[8%] top-[12%] h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent opacity-0 motion-safe:animate-forge-scan" />
              <div className="absolute w-[292px] h-[324px] left-1/2 top-[49%] [transform:translate(-50%,_-50%)_rotate(-8deg)] [filter:drop-shadow(15px_25px_12px_#77786325)] min-[1600px]:[transform:translate(-50%,_-50%)_rotate(-8deg)_scale(1.12)] max-[1100px]:[transform:translate(-50%,_-50%)_rotate(-8deg)_scale(0.85)] max-[800px]:[transform:translate(-50%,_-50%)_rotate(-8deg)_scale(0.85)] max-[540px]:[transform:translate(-50%,_-50%)_rotate(-8deg)_scale(0.7)]">
                <div className="absolute inset-0 motion-safe:animate-forge-float">
                  <div
                    data-forge-tilt
                    className="absolute inset-0 transition-transform duration-700 ease-out [transform:perspective(900px)_rotateX(var(--forge-rx,0deg))_rotateY(var(--forge-ry,0deg))]"
                  >
                    <div className="forge-bar w-[78px] h-[262px] left-[25px] top-[30px] [transform:skewY(-23deg)]" />
                    <div className="forge-bar w-[216px] h-[74px] top-2 left-[25px] [transform:skewY(-23deg)]" />
                    <div className="forge-bar w-[148px] h-[68px] top-[128px] left-[25px] [transform:skewY(-23deg)]" />
                    <div className="forge-cut" />
                  </div>
                </div>
              </div>
              <div className="absolute z-2 bg-page border border-[#cfd0c3] py-[9px] px-[11px] flex items-center gap-2.5 font-mono text-[9px] leading-[normal] tracking-[0.3px] max-[540px]:text-[7px] max-[540px]:p-[7px] max-[540px]:gap-[7px] top-[23%] left-[6%] max-[800px]:left-[15%] max-[800px]:top-[25%] max-[540px]:left-[5%] max-[540px]:top-[24%]">
                <span className="label-dot w-[5px] h-[5px] bg-[#8c947e]" /> HUMAN INTENT
              </div>
              <div className="absolute z-2 bg-page border border-[#cfd0c3] py-[9px] px-[11px] flex items-center gap-2.5 font-mono text-[9px] leading-[normal] tracking-[0.3px] max-[540px]:text-[7px] max-[540px]:p-[7px] max-[540px]:gap-[7px] right-[6%] bottom-[22%] [&_.label-dot]:bg-brand [&_>_span:last-child]:text-brand max-[800px]:right-[15%] max-[800px]:bottom-[22%] max-[540px]:right-[5%] max-[540px]:bottom-[23%]">
                <span className="label-dot w-[5px] h-[5px] bg-[#8c947e]" /> VERIFIED RESULT{' '}
                <span>↗</span>
              </div>
              <div className="absolute z-2 font-mono text-[9px] leading-[normal] text-[#8b8b80] tracking-[0.4px] max-[540px]:text-[7px] bottom-[30px] left-[26px] max-[800px]:bottom-[18px]">
                INPUT → PLAN → EXECUTE → ASSERT
              </div>
              <span className="absolute font-mono text-[21px] leading-[normal] text-[#a7aa98] top-[30px] right-[25px] max-[800px]:top-[15px]">
                +
              </span>
              <span className="absolute font-mono text-[21px] leading-[normal] text-[#a7aa98] bottom-[27px] right-[25px] max-[800px]:bottom-[15px]">
                +
              </span>
            </div>
          </div>
        </section>

        <section className="border-y border-y-page-line" aria-label="技术栈">
          <div
            className={`${containerClassName} min-h-[111px] flex items-center justify-between gap-9 max-[800px]:flex-col max-[800px]:justify-center max-[800px]:gap-[17px] max-[800px]:py-[27px]`}
          >
            <span className="text-[#8a8b81] text-[11px] max-[1100px]:text-[10px] max-[540px]:text-[10px]">
              好的测试，建立在可靠的工具之上
            </span>
            <div className="flex justify-between items-center gap-[51px] text-[#53554a] [&_>_span]:flex [&_>_span]:items-center [&_>_span]:gap-[9px] [&_>_span]:text-[20px] [&_>_span]:font-[550] [&_>_span]:tracking-[-0.8px] max-[1100px]:gap-[25px] max-[1100px]:[&_>_span]:text-[17px] max-[800px]:w-full max-[800px]:gap-5 max-[800px]:justify-evenly max-[800px]:[&_>_span]:text-[15px] max-[540px]:grid max-[540px]:grid-cols-2 max-[540px]:gap-y-5 max-[540px]:justify-items-center max-[540px]:[&_>_span]:text-[18px]">
              <span>
                <b className="text-[21px] font-medium">▲</b> Next.js
              </span>
              <span>
                <b className="font-medium text-[27px]">◈</b> Playwright
              </span>
              <span>
                <b className="font-medium text-[32px]">≈</b> deepseek
              </span>
              <span>
                <b className="font-medium text-[26px]">▥</b> PostgreSQL
              </span>
            </div>
          </div>
        </section>

        <section
          className={`${containerClassName} py-25 max-[800px]:py-16 max-[540px]:py-13`}
          id="capabilities"
          aria-labelledby="capabilities-title"
        >
          <div
            data-reveal="0"
            className="flex justify-between items-end gap-8 mb-[46px] max-[800px]:items-start max-[800px]:gap-[25px] max-[800px]:mb-[30px] max-[540px]:block"
          >
            <div>
              <p className={eyebrowClassName}>
                <span className="tiny-cross text-brand text-[16px] font-mono">+</span> THE TOOLKIT
              </p>
              <h2 id="capabilities-title" className={headingClassName}>
                从想法到验证，
                <br />
                让每一步都有章可循。
              </h2>
            </div>
            <p className="text-[13px] leading-[1.9] text-page-muted pb-[5px] max-[800px]:pt-[37px] max-[800px]:text-[11px] max-[540px]:mt-[17px] max-[540px]:p-0">
              更少的重复，更清晰的反馈。
              <br />
              一条连贯的自动化测试链路。
            </p>
          </div>
          <div className="grid grid-cols-3 border border-page-line max-[540px]:grid-cols-1">
            {features.map((feature) => (
              <article
                data-reveal={String(Number(feature.number) * 100)}
                className="group/feature relative pt-[26px] px-[30px] pb-[22px] transition-colors duration-200 hover:bg-[#f3f2eb] not-first:border-l not-first:border-page-line max-[1100px]:px-[23px] max-[800px]:py-[22px] max-[800px]:px-[19px] max-[540px]:py-[23px] max-[540px]:px-6 max-[540px]:not-first:border-l-0 max-[540px]:not-first:border-t"
                key={feature.number}
              >
                <div className="flex justify-between font-mono text-[9px] leading-[normal] tracking-[0.5px] text-[#939487] max-[800px]:text-[7px] max-[540px]:text-[9px]">
                  <span>{feature.tag}</span>
                  <span>/{feature.number}</span>
                </div>
                <div
                  className={`transition-transform duration-500 ease-out group-hover/feature:-translate-y-1 group-hover/feature:rotate-3 w-19 h-19 mt-[35px] mb-[25px] border grid place-items-center font-mono leading-[normal] tracking-[-4px] relative max-[800px]:mt-7 max-[540px]:w-[62px] max-[540px]:h-[62px] max-[540px]:mt-6 max-[540px]:mb-5 ${feature.appearance}`}
                  aria-hidden="true"
                >
                  {feature.symbol}
                  <span className="absolute -bottom-2 -right-[5px] font-mono text-[14px] text-[#899173] bg-page leading-none">
                    +
                  </span>
                </div>
                <h3 className="text-[24px] font-[550] tracking-[-0.7px] leading-[1.5] max-[1100px]:text-[22px] max-[800px]:text-[19px] max-[540px]:text-[24px]">
                  {feature.title[0]}
                  <br />
                  {feature.title[1]}
                </h3>
                <p className="mt-[17px] min-h-[94px] text-page-muted text-[12px] leading-[1.95] max-[800px]:text-[11px] max-[800px]:min-h-[130px] max-[540px]:text-[12px] max-[540px]:min-h-0 max-[540px]:mt-[13px]">
                  {feature.description}
                </p>
                <div className="flex justify-between items-center border-t border-t-page-line pt-5 mt-[29px] text-[10px] text-[#6e7263] [&_>_span:last-child]:text-[17px] max-[800px]:text-[8px] max-[540px]:text-[10px] max-[540px]:mt-[21px] max-[540px]:pt-4">
                  <span>{feature.note}</span>
                  <span aria-hidden="true">↗</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          className="border-y border-y-page-line bg-[#f0f0e9]"
          id="workflow"
          aria-labelledby="workflow-title"
        >
          <div className={`${containerClassName} py-25 max-[800px]:py-16 max-[540px]:py-13`}>
            <div
              data-reveal="0"
              className="flex justify-between items-end gap-8 mb-[46px] max-[800px]:items-start max-[800px]:gap-[25px] max-[800px]:mb-[30px] max-[540px]:block"
            >
              <div>
                <p className={eyebrowClassName}>
                  <span className="tiny-cross text-brand text-[16px] font-mono">+</span> FROM WORDS
                  TO WORKING
                </p>
                <h2 id="workflow-title" className={headingClassName}>
                  你来描述。
                  <br />
                  CaseForge 来执行。
                </h2>
              </div>
              <p className="text-[13px] leading-[1.9] text-page-muted pb-[5px] max-[800px]:pt-[37px] max-[800px]:text-[11px] max-[540px]:mt-[17px] max-[540px]:p-0">
                用你熟悉的语言，写下你关心的结果。
                <br />
                其余步骤，交给测试引擎。
              </p>
            </div>
            <MarketingDemo />
            <div
              data-reveal="80"
              className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-x-[58px] mt-11 [&_>_div_>_span]:font-mono [&_>_div_>_span]:text-[9px] [&_>_div_>_span]:leading-[normal] [&_>_div_>_span]:text-[#979b8c] [&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:mt-3 [&_p]:text-[#939789] [&_p]:mt-1.5 [&_p]:text-[11px] max-[1100px]:gap-x-[30px] max-[800px]:gap-x-[15px] max-[800px]:[&_h3]:text-[14px] max-[800px]:[&_p]:text-[10px] max-[540px]:grid-cols-1 max-[540px]:gap-[23px] max-[540px]:pl-[18px] max-[540px]:border-l max-[540px]:border-l-[#d7dbca] max-[540px]:mt-[31px] max-[540px]:[&_h3]:text-[15px] max-[540px]:[&_h3]:mt-2 max-[540px]:[&_p]:text-[11px]"
            >
              <div>
                <span>01 / DESCRIBE</span>
                <h3>写下测试目标</h3>
                <p>输入操作步骤与预期结果</p>
              </div>
              <span className="text-[#a9ad9b] text-[23px] max-[540px]:hidden" aria-hidden="true">
                →
              </span>
              <div>
                <span>02 / EXECUTE</span>
                <h3>观察、规划、执行</h3>
                <p>根据页面状态驱动真实浏览器</p>
              </div>
              <span className="text-[#a9ad9b] text-[23px] max-[540px]:hidden" aria-hidden="true">
                →
              </span>
              <div>
                <span>03 / VERIFY</span>
                <h3>用证据验证结果</h3>
                <p>读取页面状态，完成结果断言</p>
              </div>
            </div>
          </div>
        </section>

        <section
          data-reveal="0"
          className={`pt-[94px] pb-[67px] border-b border-b-page-line [&_h2_>_span]:block [&_h2_>_span]:text-[#a5aa93] max-[800px]:pt-[65px] max-[800px]:pb-[45px] ${containerClassName}`}
        >
          <p className={eyebrowClassName}>
            <span className="tiny-cross text-brand text-[16px] font-mono">+</span> OUR PHILOSOPHY
          </p>
          <div className="grid grid-cols-[1.4fr_1fr] gap-[85px] items-center [&_>_div]:pt-5 [&_p]:text-[13px] [&_p]:text-page-muted [&_p]:leading-[2] [&_p]:max-w-[350px] max-[1100px]:gap-[50px] max-[800px]:gap-[35px] max-[800px]:[&_p]:text-[12px] max-[540px]:grid-cols-1 max-[540px]:gap-0">
            <h2 className="mt-[19px] font-[550] tracking-[-1.4px] max-[540px]:leading-[1.45] max-[540px]:tracking-[-1px] text-[43px] leading-[1.45] max-[800px]:text-[34px] max-[540px]:text-[34px]">
              测试应该跟得上<span>想法的速度。</span>
            </h2>
            <div>
              <p>
                让人表达意图，让工具处理执行。我们希望把繁琐的浏览器操作，变成清晰、可验证的测试流程。
              </p>
              <a
                href="#capabilities"
                className="inline-flex items-center gap-[45px] text-ink text-[11px] border-b border-b-[#b7b9a9] pt-3.5 pb-[7px] mt-[13px] hover:text-brand"
              >
                认识 CaseForge <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <div className="flex items-center gap-[19px] mt-[55px] font-mono text-[8px] leading-[normal] tracking-[0.7px] text-[#919683] max-[540px]:mt-[33px] max-[540px]:gap-2.5 max-[540px]:text-[6px]">
            <span>HUMAN INTENT</span>
            <span className="h-px bg-[#daddcc] flex-1 relative [&::after]:[content:'→'] [&::after]:absolute [&::after]:-right-px [&::after]:-top-[7px] [&::after]:bg-page [&::after]:text-[14px]" />
            <span>MACHINE PRECISION</span>
          </div>
        </section>

        <section
          className={`grid grid-cols-[1fr_1.45fr] gap-[65px] max-[1100px]:gap-10 max-[800px]:grid-cols-1 max-[800px]:gap-[33px] ${containerClassName} py-25 max-[800px]:py-16 max-[540px]:py-13`}
          data-reveal="0"
          id="faq"
          aria-labelledby="faq-title"
        >
          <div>
            <p className={eyebrowClassName}>
              <span className="tiny-cross text-brand text-[16px] font-mono">+</span> GOOD QUESTIONS
            </p>
            <h2 id="faq-title" className={headingClassName}>
              开始之前，
              <br />
              你可能想知道。
            </h2>
          </div>
          <div className="border-t border-page-line">
            {faqs.map(([question, answer], index) => (
              <details className="group border-b border-page-line" key={question}>
                <summary className="flex items-center gap-5 py-[22px] text-[13px] cursor-pointer list-none [&::-webkit-details-marker]:hidden max-[540px]:text-[12px] max-[540px]:gap-3">
                  <span className="text-[#a1a494] font-mono text-[9px] leading-[normal]">
                    0{index + 1}
                  </span>
                  <span>{question}</span>
                  <span
                    className="ml-auto font-mono text-[19px] leading-[normal] text-[#858b75] transition-transform duration-200 group-open:rotate-45 group-open:text-brand motion-reduce:transition-none"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="text-page-muted text-[12px] leading-[2] pr-7 pb-[25px] pl-[34px] max-[540px]:pl-[26px] max-[540px]:pr-2.5 max-[540px]:text-[11px]">
                  {answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section
          data-reveal="0"
          className="bg-[#e9ebde] border-y border-y-[#daddcc] [&_h2_span]:text-brand"
        >
          <div
            className={`${containerClassName} flex justify-between items-center gap-[45px] pt-[65px] pb-[70px] max-[800px]:py-12 max-[540px]:flex-col max-[540px]:items-start max-[540px]:gap-[21px]`}
          >
            <div>
              <p className={eyebrowClassName}>YOUR NEXT TEST STARTS HERE.</p>
              <h2 className="font-[550] leading-[1.4] tracking-[-1.4px] max-[540px]:leading-[1.45] max-[540px]:tracking-[-1px] mt-4 text-[43px] max-[800px]:text-[33px] max-[540px]:text-[34px]">
                少写一点脚本。
                <br />
                多向前走一步<span>.</span>
              </h2>
            </div>
            <div className="pt-[25px] [&_p]:text-[#909780] [&_p]:text-[10px] [&_p]:mt-[15px] max-[800px]:[&_a]:text-[11px] max-[800px]:[&_a]:gap-5 max-[540px]:pt-0 max-[540px]:[&_a]:gap-[70px] max-[540px]:[&_p]:mt-2.5">
              <Link
                className="inline-flex items-center justify-between py-[15px] px-[23px] min-h-13 text-[13px] font-medium transition duration-200 hover:-translate-y-0.5 [&_span]:text-[18px] [&_span]:leading-none [&_span]:transition-transform [&_span]:duration-300 hover:[&_span]:translate-x-1 hover:[&_span]:-translate-y-0.5 max-[1100px]:gap-[22px] max-[1100px]:px-[18px] max-[540px]:text-[11px] max-[540px]:py-[13px] max-[540px]:px-[15px] max-[540px]:min-h-[46px] max-[540px]:gap-5 bg-[#2d3325] text-[#f6f7f0] gap-[65px] hover:bg-[#414b35]"
                href="/cases"
              >
                开始使用 CaseForge <span aria-hidden="true">↗</span>
              </Link>
              <p>从你的第一个自然语言用例开始。</p>
            </div>
          </div>
        </section>
      </main>

      <footer className={`${containerClassName} pt-[49px] pb-[23px] max-[540px]:pt-[35px]`}>
        <div className="flex items-center gap-[30px] max-[800px]:flex-wrap max-[800px]:gap-5">
          <Link
            className="inline-flex items-center text-ink text-[24px] font-bold tracking-[-1.6px] leading-none"
            href="/"
            aria-label="CaseForge 首页"
          >
            <span
              className="inline-grid place-items-center w-[22px] h-[29px] mr-2 font-mono text-[30px] font-semibold -rotate-45"
              aria-hidden="true"
            >
              ↳
            </span>
            caseforge<span className="text-brand">.</span>
          </Link>
          <p className="text-[#999c8e] text-[10px] max-[800px]:ml-auto max-[540px]:text-[9px]">
            让每一次测试，都更简单。
          </p>
          <nav
            className="flex gap-[27px] ml-auto [&_a]:text-[#5c5e55] [&_a]:text-[10px] [&_a]:transition-colors [&_a:hover]:text-brand max-[800px]:w-full max-[800px]:justify-end max-[540px]:justify-start max-[540px]:gap-7"
            aria-label="页脚导航"
          >
            <a href="#capabilities">产品能力</a>
            <a href="#workflow">工作原理</a>
            <Link href="/cases">工作台 ↗</Link>
          </nav>
        </div>
        <div className="mt-[37px] pt-5 border-t border-t-page-line flex justify-between gap-4 font-mono text-[8px] leading-[normal] text-[#979b8c] [&_>_a]:text-[#7a806c] [&_>_a]:font-sans max-[800px]:[&_>_span:nth-child(2)]:hidden max-[540px]:mt-[27px]">
          <span>© {new Date().getFullYear()} CaseForge</span>
          <span>BUILT WITH INTENT. TESTED WITH EVIDENCE.</span>
          <a href="#hero-title">回到顶部 ↑</a>
        </div>
      </footer>
    </MarketingMotion>
  );
}
