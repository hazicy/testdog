'use client';

import styles from './MarketingDemo.module.css';

import { statusStyles } from '@/components/ui/statusStyles';
import { Tabs } from '@/components/ui/Tabs';

const examples = [
  {
    name: '登录验证',
    url: 'app.example.com/login',
    input: [
      '打开登录页面',
      '输入邮箱 tester@example.com 和密码',
      '点击「登录」按钮',
      '验证页面显示「欢迎回来」',
    ],
    steps: [
      '编译用例：4 个测试步骤',
      '观察页面：识别登录表单',
      '执行操作：填写信息并点击登录',
      '验证结果：页面包含「欢迎回来」',
    ],
    title: '欢迎回来',
    subtitle: '你已成功登录工作区。',
    badge: '登录成功',
  },
  {
    name: '表单提交',
    url: 'app.example.com/contact',
    input: [
      '打开联系表单页面',
      '填写姓名、邮箱和留言',
      '点击「提交」按钮',
      '验证页面显示「提交成功」',
    ],
    steps: [
      '编译用例：4 个测试步骤',
      '观察页面：识别联系表单',
      '执行操作：填写字段并提交',
      '验证结果：页面包含「提交成功」',
    ],
    title: '提交成功',
    subtitle: '我们已收到你的留言。',
    badge: '表单已提交',
  },
  {
    name: '页面导航',
    url: 'app.example.com/settings',
    input: [
      '打开工作区首页',
      '点击导航中的「设置」',
      '等待设置页面加载',
      '验证页面显示「账户设置」',
    ],
    steps: [
      '编译用例：4 个测试步骤',
      '观察页面：识别导航入口',
      '执行操作：点击设置并等待页面',
      '验证结果：页面包含「账户设置」',
    ],
    title: '账户设置',
    subtitle: '在这里管理你的个人信息。',
    badge: '导航已完成',
  },
];

export function MarketingDemo() {
  return (
    <Tabs.Root defaultValue={0} className={styles.root}>
      <div className={styles.container}>
        <Tabs.List activateOnFocus className={styles.list} aria-label="用例示例">
          {examples.map((item, index) => (
            <Tabs.Tab key={item.name} value={index} className={styles.tab}>
              {item.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <span className={styles.label}>交互示例</span>
      </div>
      {examples.map((example, index) => (
        <Tabs.Panel key={example.name} value={index} className={styles.panel}>
          <section className={styles.section} aria-label="测试描述">
            <h3 className={styles.subheading}>测试描述</h3>
            <p className={styles.description}>https://{example.url}</p>
            <ol className={styles.ol}>
              {example.input.map((line, index) => (
                <li key={line} className={styles.item}>
                  <span className={styles.stepNumber}>{index + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className={styles.result} aria-label="示例执行结果">
            <div className={styles.resultHeading}>
              <h3 className={styles.resultTitle}>执行记录</h3>
              <span data-slot="status" data-status="passed" className={statusStyles('passed')}>
                <span />
                已通过
              </span>
            </div>
            <ol className={styles.ol}>
              {example.steps.map((step) => (
                <li key={step} className={styles.item}>
                  <span aria-hidden="true" className={styles.checkmark}>
                    ✓
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className={styles.evidence}>
              <p className={styles.evidenceCaption}>页面证据：{example.title}</p>
            </div>
          </section>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
