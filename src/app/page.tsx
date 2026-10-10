import Link from 'next/link';
import Image from 'next/image';
import { Brand } from '@/components/brand/Brand';
import { MarketingDemo } from '@/features/marketing/components/MarketingDemo';
import { MarketingMotion } from '@/features/marketing/components/MarketingMotion';
import '@/features/marketing/components/marketing.css';

const faqs = [
  ['需要编写测试脚本吗？', '描述步骤和预期即可。录制后，也可以编辑操作与 Playwright 断言。'],
  ['支持哪些平台？', '支持 Web、Android 和 iOS。原生测试需配置设备 worker 与应用构建。'],
  ['如何确认测试结果？', '通过截图、断言、日志和录像，查看执行结果与失败位置。'],
  ['可以在本地部署吗？', '可以。配置 PostgreSQL、Redis 和模型服务后，启动应用与执行 worker。'],
];

export default function Home() {
  return (
    <MarketingMotion className="marketing">
      <a href="#main-content" className="marketing-skip">
        跳转到主内容
      </a>
      <header className="marketing-header">
        <div className="marketing-container marketing-nav">
          <Link href="/" aria-label="testdog 首页">
            <Brand />
          </Link>
          <nav aria-label="页面导航">
            <a href="#features">产品能力</a>
            <a href="#workflow">使用流程</a>
            <a href="#faq">常见问题</a>
          </nav>
          <Link href="/cases" className="marketing-button small">
            进入工作台 <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </header>
      <main id="main-content">
        <section className="marketing-hero marketing-container">
          <div className="marketing-hero-copy">
            <h1 data-entrance="100">
              把测试交给 AI。
              <br />
              <span>把信心带回发布。</span>
            </h1>
            <p className="marketing-intro" data-entrance="200">
              用自然语言写测试，在真实环境中验证。
            </p>
            <div className="marketing-actions" data-entrance="300">
              <Link href="/cases" className="marketing-button primary">
                开始使用 <span aria-hidden="true">↗</span>
              </Link>
              <a href="#workflow" className="marketing-button">
                查看演示 <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>
          <div
            className="marketing-art"
            data-hero-art
            data-entrance="150"
            aria-label="testdog 将描述转化为测试证据的动态示意"
          >
            <div className="marketing-art-grid" />
            <div className="marketing-orbit orbit-one" />
            <div className="marketing-orbit orbit-two" />
            <div className="marketing-orbit orbit-three" />
            <div className="marketing-core" data-forge-tilt>
              <div className="marketing-core-face">
                <Image src="/brand/testdog-mark.svg" alt="" width={112} height={112} unoptimized />
              </div>
            </div>
            <div className="marketing-art-label label-input">
              <span className="art-icon">Aa</span>
              <div>
                <strong>「验证用户成功登录」</strong>
              </div>
            </div>
            <div className="marketing-art-label label-execute">
              <span className="art-icon">↗</span>
              <div>
                <strong>
                  真实执行
                  <span className="marketing-live" />
                </strong>
              </div>
            </div>
            <div className="marketing-art-label label-result">
              <span className="art-icon green">✓</span>
              <div>
                <strong>验证通过</strong>
              </div>
            </div>
          </div>
        </section>
        <div className="marketing-platforms marketing-container">
          <span>跨平台，轻松测。</span>
          <div>
            <span>◎ Web</span>
            <span>◉ Android</span>
            <span>◈ iOS</span>
          </div>
        </div>
        <section id="features" className="marketing-section marketing-container">
          <div className="marketing-section-heading" data-reveal>
            <h2>测试，本该如此简单。</h2>
          </div>
          <div className="marketing-features">
            <article className="marketing-feature feature-language" data-reveal>
              <div className="marketing-feature-visual">
                <div className="marketing-prompt">
                  <span>测试用例</span>
                  <p>
                    打开登录页面
                    <br />
                    输入邮箱和密码
                    <br />
                    点击「登录」
                    <br />
                    <em>验证页面显示「欢迎回来」</em>
                    <b className="marketing-caret">▍</b>
                  </p>
                </div>
              </div>
              <h3>会表达，就能写测试。</h3>
              <p>描述步骤与预期，AI 生成执行计划。</p>
            </article>
            <article className="marketing-feature" data-reveal="100">
              <div className="marketing-feature-visual">
                <div className="marketing-mini-flow">
                  <span>观察页面</span>
                  <i>↓</i>
                  <span className="active">
                    执行操作 <b className="marketing-live" />
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
            <article className="marketing-feature" data-reveal="200">
              <div className="marketing-feature-visual">
                <div className="marketing-evidence">
                  <span className="marketing-evidence-check">✓</span>
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
        <section id="workflow" className="marketing-section marketing-container">
          <div className="marketing-demo-heading" data-reveal>
            <div>
              <h2>写下步骤，见证结果。</h2>
            </div>
          </div>
          <div className="marketing-demo" data-reveal>
            <div className="marketing-demo-title">
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
          className="marketing-section marketing-container marketing-faq"
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
        <section className="marketing-closing marketing-container" data-reveal>
          <div className="marketing-closing-glow" />
          <h2>
            下一次发布，
            <br />
            <span>让信心先到位。</span>
          </h2>
          <Link href="/cases" className="marketing-button primary">
            开始使用 testdog <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
      <footer className="marketing-container marketing-footer">
        <Brand />
        <span>© {new Date().getFullYear()} testdog</span>
        <a href="#main-content">回到顶部 ↑</a>
      </footer>
    </MarketingMotion>
  );
}
