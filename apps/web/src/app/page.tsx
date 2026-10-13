import clsx from 'clsx';
import marketingStyles from '@/features/marketing/components/marketing.module.css';
import Link from 'next/link';
import Image from 'next/image';
import { Brand } from '@/components/brand/Brand';
import { MarketingDemo } from '@/features/marketing/components/MarketingDemo';
import { MarketingMotion } from '@/features/marketing/components/MarketingMotion';

const faqs = [
  ['需要编写测试脚本吗？', '描述步骤和预期即可。录制后，也可以编辑操作与 Playwright 断言。'],
  ['支持哪些平台？', '支持 Web、Android 和 iOS。原生测试需配置设备 worker 与应用构建。'],
  ['如何确认测试结果？', '通过截图、断言、日志和录像，查看执行结果与失败位置。'],
  ['可以在本地部署吗？', '可以。配置 PostgreSQL、Redis 和模型服务后，启动应用与执行 worker。'],
];

export default function Home() {
  return (
    <MarketingMotion className={marketingStyles.marketing}>
      <a href="#main-content" className={marketingStyles.marketingSkip}>
        跳转到主内容
      </a>
      <header className={marketingStyles.marketingHeader}>
        <div className={clsx(marketingStyles.marketingContainer, marketingStyles.marketingNav)}>
          <Link href="/" aria-label="testdog 首页">
            <Brand />
          </Link>
          <nav aria-label="页面导航">
            <a href="#features">产品能力</a>
            <a href="#workflow">使用流程</a>
            <a href="#faq">常见问题</a>
          </nav>
          <Link
            href="/cases"
            className={clsx(marketingStyles.marketingButton, marketingStyles.small)}
          >
            进入工作台 <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section
          className={clsx(marketingStyles.marketingHero, marketingStyles.marketingContainer)}
        >
          <div>
            <h1 data-entrance="100">
              把测试交给 AI。
              <br />
              <span>把信心带回发布。</span>
            </h1>
            <p className={marketingStyles.marketingIntro} data-entrance="200">
              用自然语言写测试，在真实环境中验证。
            </p>
            <div className={marketingStyles.marketingActions} data-entrance="300">
              <Link
                href="/cases"
                className={clsx(marketingStyles.marketingButton, marketingStyles.primary)}
              >
                开始使用 <span aria-hidden="true">↗</span>
              </Link>
              <a href="#workflow" className={marketingStyles.marketingButton}>
                查看演示 <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
          <div
            className={marketingStyles.marketingArt}
            data-hero-art
            data-entrance="150"
            aria-label="testdog 将描述转化为测试证据的动态示意"
          >
            <div className={marketingStyles.marketingArtGrid} />
            <div className={clsx(marketingStyles.marketingOrbit, marketingStyles.orbitOne)} />
            <div className={clsx(marketingStyles.marketingOrbit, marketingStyles.orbitTwo)} />
            <div className={clsx(marketingStyles.marketingOrbit, marketingStyles.orbitThree)} />
            <div className={marketingStyles.marketingCore} data-forge-tilt>
              <div className={marketingStyles.marketingCoreFace}>
                <Image src="/brand/testdog-mark.svg" alt="" width={112} height={112} unoptimized />
              </div>
            </div>
            <div className={clsx(marketingStyles.marketingArtLabel, marketingStyles.labelInput)}>
              <span className={marketingStyles.artIcon}>Aa</span>
              <div>
                <strong>「验证用户成功登录」</strong>
              </div>
            </div>
            <div className={clsx(marketingStyles.marketingArtLabel, marketingStyles.labelExecute)}>
              <span className={marketingStyles.artIcon}>↗</span>
              <div>
                <strong>
                  真实执行
                  <span className={marketingStyles.marketingLive} />
                </strong>
              </div>
            </div>
            <div className={clsx(marketingStyles.marketingArtLabel, marketingStyles.labelResult)}>
              <span className={clsx(marketingStyles.artIcon, marketingStyles.green)}>✓</span>
              <div>
                <strong>验证通过</strong>
              </div>
            </div>
          </div>
        </section>
        <div
          className={clsx(marketingStyles.marketingPlatforms, marketingStyles.marketingContainer)}
        >
          <span>跨平台，轻松测。</span>
          <div>
            <span>◎ Web</span>
            <span>◉ Android</span>
            <span>◈ iOS</span>
          </div>
        </div>
        <section
          id="features"
          className={clsx(marketingStyles.marketingSection, marketingStyles.marketingContainer)}
        >
          <div className={marketingStyles.marketingSectionHeading} data-reveal>
            <h2>测试，本该如此简单。</h2>
          </div>
          <div className={marketingStyles.marketingFeatures}>
            <article className={marketingStyles.marketingFeature} data-reveal>
              <div className={marketingStyles.marketingFeatureVisual}>
                <div className={marketingStyles.marketingPrompt}>
                  <span>测试用例</span>
                  <p>
                    打开登录页面
                    <br />
                    输入邮箱和密码
                    <br />
                    点击「登录」
                    <br />
                    <em>验证页面显示「欢迎回来」</em>
                    <b className={marketingStyles.marketingCaret}>▍</b>
                  </p>
                </div>
              </div>
              <h3>会表达，就能写测试。</h3>
              <p>描述步骤与预期，AI 生成执行计划。</p>
            </article>
            <article className={marketingStyles.marketingFeature} data-reveal="100">
              <div className={marketingStyles.marketingFeatureVisual}>
                <div className={marketingStyles.marketingMiniFlow}>
                  <span>观察页面</span>
                  <i>↓</i>
                  <span className={marketingStyles.active}>
                    执行操作 <b className={marketingStyles.marketingLive} />
                  </span>
                  <i>↓</i>
                  <span>
                    验证结果 <b>✓</b>
                  </span>
                </div>
              </div>
              <h3>在真实环境里，走一遍。</h3>
              <p>浏览器与原生设备，真实操作，逐步验证。</p>
            </article>
            <article className={marketingStyles.marketingFeature} data-reveal="200">
              <div className={marketingStyles.marketingFeatureVisual}>
                <div className={marketingStyles.marketingEvidence}>
                  <span className={marketingStyles.marketingEvidenceCheck}>✓</span>
                  <strong>预期与页面状态一致</strong>
                  <div>
                    <span>截图证据</span>
                    <span>执行日志</span>
                    <span>操作重放</span>
                  </div>
                </div>
              </div>
              <h3>结果可信，也有迹可循。</h3>
              <p>截图、日志与重放，让每一步有据可循。</p>
            </article>
          </div>
        </section>
        <section
          id="workflow"
          className={clsx(marketingStyles.marketingSection, marketingStyles.marketingContainer)}
        >
          <div className={marketingStyles.marketingDemoHeading} data-reveal>
            <div>
              <h2>写下步骤，见证结果。</h2>
            </div>
          </div>
          <div className={marketingStyles.marketingDemo} data-reveal>
            <div className={marketingStyles.marketingDemoTitle}>
              <span>
                <i />
                <i />
                <i />
              </span>
              <span>交互示例</span>
            </div>
            <MarketingDemo />
          </div>
        </section>
        <section
          id="faq"
          className={clsx(
            marketingStyles.marketingSection,
            marketingStyles.marketingContainer,
            marketingStyles.marketingFaq,
          )}
          data-reveal
        >
          <div>
            <h2>常见问题</h2>
          </div>
          <div>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className={clsx(marketingStyles.marketingClosing, marketingStyles.marketingContainer)}
          data-reveal
        >
          <div className={marketingStyles.marketingClosingGlow} />
          <h2>
            下一次发布，
            <br />
            <span>让信心先到位。</span>
          </h2>
          <Link
            href="/cases"
            className={clsx(marketingStyles.marketingButton, marketingStyles.primary)}
          >
            开始使用 testdog <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
      <footer className={clsx(marketingStyles.marketingContainer, marketingStyles.marketingFooter)}>
        <Brand />
        <span>© {new Date().getFullYear()} testdog</span>
        <a href="#main-content">回到顶部 ↑</a>
      </footer>
    </MarketingMotion>
  );
}
