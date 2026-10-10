'use client';
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
    <Tabs.Root
      defaultValue={0}
      className="overflow-hidden rounded-lg border border-page-line bg-[#fffefa]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-page-line px-5">
        <Tabs.List activateOnFocus className="flex gap-6" aria-label="用例示例">
          {examples.map((item, index) => (
            <Tabs.Tab
              key={item.name}
              value={index}
              className="cursor-pointer border-b-2 border-transparent py-4 text-sm text-[#64665d] hover:text-ink aria-selected:border-[#b84c2e] aria-selected:text-ink"
            >
              {item.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <span className="py-3 text-xs text-[#73766b]">交互示例</span>
      </div>
      {examples.map((example, index) => (
        <Tabs.Panel key={example.name} value={index} className="grid md:grid-cols-2">
          <section
            className="border-b border-page-line p-6 sm:p-8 md:border-b-0 md:border-r"
            aria-label="测试描述"
          >
            <h3 className="mb-5 text-sm font-semibold">测试描述</h3>
            <p className="mb-5 break-all rounded-md bg-[#f3f3ef] px-3 py-2 font-mono text-xs text-[#64665d]">
              https://{example.url}
            </p>
            <ol className="space-y-4">
              {example.input.map((line, index) => (
                <li key={line} className="flex gap-3 text-sm leading-6">
                  <span className="w-5 shrink-0 tabular-nums text-[#73766b]">{index + 1}.</span>
                  <span>{line}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="p-6 sm:p-8" aria-label="示例执行结果">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">执行记录</h3>
              <span className="ws-status passed">
                <span />
                已通过
              </span>
            </div>
            <ol className="space-y-4">
              {example.steps.map((step) => (
                <li key={step} className="flex gap-3 text-sm leading-6">
                  <span aria-hidden="true" className="text-[#49815a]">
                    ✓
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6 rounded-md border border-[#d7e1d5] bg-[#f4f8f2] px-4 py-3">
              <p className="text-sm font-medium text-[#42664a]">页面证据：{example.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#64665d]">
                预期结果与页面状态一致 · 示例包含 4 个步骤、1 个断言
              </p>
            </div>
          </section>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
