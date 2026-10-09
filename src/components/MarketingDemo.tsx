'use client';

import { useState } from 'react';

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
  const [active, setActive] = useState(0);
  const example = examples[active];

  return (
    <div className="border border-[#d3d4c8] shadow-[0_10px_24px_#25291e05]">
      <div className="flex justify-between items-center bg-[#faf9f6] border-b border-b-[#d3d4c8] py-0 px-[22px] max-[540px]:px-[13px]">
        <div className="flex gap-7 max-[540px]:gap-5" role="tablist" aria-label="用例示例">
          {examples.map((item, index) => (
            <button
              key={item.name}
              id={`demo-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-controls="demo-panel"
              tabIndex={active === index ? 0 : -1}
              className="relative cursor-pointer border-0 bg-transparent px-px py-[18px] text-[11px] text-[#85877a] transition-colors hover:text-ink aria-selected:text-ink after:absolute after:-bottom-px after:inset-x-0 after:h-0.5 after:bg-transparent aria-selected:after:bg-brand max-[540px]:py-4 max-[540px]:text-[10px]"
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === 'ArrowRight') next = (index + 1) % examples.length;
                else if (event.key === 'ArrowLeft')
                  next = (index - 1 + examples.length) % examples.length;
                else if (event.key === 'Home') next = 0;
                else if (event.key === 'End') next = examples.length - 1;
                else return;
                event.preventDefault();
                setActive(next);
                document.getElementById(`demo-tab-${next}`)?.focus();
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
        <span className="flex items-center gap-2 text-[#87897c] text-[10px] max-[540px]:text-[8px] max-[540px]:gap-[5px] max-[540px]:[&_.status-dot]:w-1 max-[540px]:[&_.status-dot]:h-1">
          <span className="status-dot inline-block flex-none h-1.5 w-1.5 rounded-full bg-[#78a576]" />{' '}
          交互示例
        </span>
      </div>
      <div
        className="grid grid-cols-[1.07fr_1fr] max-[800px]:grid-cols-1"
        id="demo-panel"
        role="tabpanel"
        aria-labelledby={`demo-tab-${active}`}
        tabIndex={0}
      >
        <div className="min-w-0 bg-[#24271f] text-[#e9ecdf] flex flex-col">
          <div className="flex justify-between items-center py-4 px-[22px] border-b border-b-[#3d4035] font-mono text-[10px] leading-[normal] text-[#acb29f] [&_>_span:last-child]:text-[8px] [&_>_span:last-child]:text-[#7e8771] max-[540px]:px-[15px] max-[540px]:[&_>_span:last-child]:text-[7px]">
            <span>
              <span className="text-brand mr-[7px] text-[16px]" aria-hidden="true">
                ≡
              </span>{' '}
              test-case.txt
            </span>
            <span>PLAIN LANGUAGE</span>
          </div>
          <div className="pt-[27px] px-6 pb-[23px] font-mono text-[12px] leading-[2.6] max-[1100px]:text-[10px] max-[1100px]:px-[17px] max-[800px]:text-[12px] max-[540px]:text-[10px] max-[540px]:py-[21px] max-[540px]:px-3.5">
            <div className="mt-0 mr-0 mb-[15px] ml-[29px] text-[#8d967e] text-[11px] max-[540px]:ml-[23px] max-[540px]:text-[10px]">
              # 描述你的测试用例
            </div>
            {example.input.map((line, index) => (
              <div className="flex items-baseline gap-[18px] max-[540px]:gap-2.5" key={line}>
                <span className="text-[#606956] text-[10px] flex-none">0{index + 1}</span>
                <span>{line}</span>
              </div>
            ))}
            <div
              className="animate-cursor-blink motion-reduce:animate-none h-3.5 w-1.5 bg-[#c2c8b1] ml-[31px] mt-3 max-[540px]:ml-[23px]"
              aria-hidden="true"
            />
          </div>
          <div className="my-0 mx-[22px] pt-[18px] pb-[27px] border-t border-t-[#42473a] max-[540px]:mx-[15px]">
            <div className="flex justify-between text-[#8c987c] font-mono text-[9px] leading-[normal] mb-[15px]">
              <span>OUTPUT</span>
              <span className="text-[9px] text-[#a7b594]">● 示例执行日志</span>
            </div>
            {example.steps.map((step, index) => (
              <div
                className="flex items-baseline gap-2.5 font-mono text-[10px] leading-[2.5] text-[#bbc3ad] max-[1100px]:text-[9px] max-[800px]:text-[11px] max-[540px]:text-[9px] max-[540px]:gap-[7px]"
                key={step}
              >
                <span className="text-[#6e7960] text-[9px]">00:0{index + 1}</span>
                <span className="text-[#afc397]">✓</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-auto py-[15px] px-[22px] border-t border-t-[#3d4035] font-mono text-[8px] leading-[normal] text-[#859175] [&_>_span:last-child]:text-[#aab79a] max-[540px]:px-[15px] max-[540px]:text-[7px]">
            <span>4 STEPS / 1 ASSERTION</span>
            <span>
              CASEFORGE ENGINE <span aria-hidden="true">↗</span>
            </span>
          </div>
        </div>
        <div className="bg-[#faf9f6] flex flex-col min-w-0 max-[800px]:border-t max-[800px]:border-t-[#d3d4c8]">
          <div className="flex justify-between items-center gap-3.5 py-4 px-[19px] border-b border-b-[#e2e3d8] font-mono text-[9px] leading-[normal] text-[#8e9182] [&_>_span:nth-child(2)]:bg-[#efefe7] [&_>_span:nth-child(2)]:py-1 [&_>_span:nth-child(2)]:px-[15px] [&_>_span:nth-child(2)]:flex-1 [&_>_span:nth-child(2)]:text-center max-[540px]:px-[13px] max-[540px]:text-[8px] max-[540px]:[&_>_span:nth-child(2)]:px-[7px]">
            <div className="flex gap-[5px] [&_i]:w-1.5 [&_i]:h-1.5 [&_i]:bg-[#ced0c4] [&_i]:rounded-full">
              <i />
              <i />
              <i />
            </div>
            <span>
              <span aria-hidden="true">⌁</span> {example.url}
            </span>
            <span aria-hidden="true">↗</span>
          </div>
          <div className="pt-[22px] px-[30px] pb-[17px] [background-image:radial-gradient(#dadcce_1px,_transparent_1px)] [background-size:15px_15px] flex-1 max-[800px]:px-[35px] max-[540px]:px-5">
            <div className="flex items-center gap-[7px] font-mono text-[9px] leading-[normal] text-[#818673]">
              <span className="text-[19px] text-[#838e71]" aria-hidden="true">
                ↳
              </span>{' '}
              example workspace
            </div>
            <div
              className="animate-preview-enter motion-reduce:animate-none max-w-[270px] mt-[27px] mx-auto mb-[31px] text-center [&_h3]:text-[25px] [&_h3]:font-semibold [&_h3]:tracking-[-0.8px] [&_h3_>_span]:text-brand [&_h3_>_span]:ml-0.5 [&_>_p]:text-[10px] [&_>_p]:text-[#949788] [&_>_p]:mt-1.5 max-[800px]:my-[26px]"
              key={active}
            >
              <div
                className="grid place-items-center h-[43px] w-[43px] mt-0 mx-auto mb-[15px] bg-[#e5ead9] text-[#798d5b] border border-[#d3ddc1] text-[23px]"
                aria-hidden="true"
              >
                ✓
              </div>
              <h3>
                {example.title}
                <span>.</span>
              </h3>
              <p>{example.subtitle}</p>
              <div className="flex items-center gap-2.5 py-[13px] px-[15px] mt-[22px] border border-[#e0e3d6] bg-[#fafbf6] text-left [&_>_div]:flex [&_>_div]:flex-col [&_>_div]:gap-px [&_strong]:text-[10px] [&_strong]:font-medium [&_div_>_span]:font-mono [&_div_>_span]:text-[8px] [&_div_>_span]:leading-[normal] [&_div_>_span]:text-[#949a86]">
                <span className="grid place-items-center bg-[#e7eadd] w-[30px] h-[30px] text-[#7f886c] text-[12px]">
                  T
                </span>
                <div>
                  <strong>Test account</strong>
                  <span>tester@example.com</span>
                </div>
                <span className="h-[5px] w-[5px] bg-[#93a779] rounded-full ml-auto" />
              </div>
              <div className="relative mt-[11px] p-[9px] text-[#728657] text-[10px] bg-[#ebf0e15c] border border-dashed border-[#a7b88e] [&_>_span:first-child]:mr-1.5">
                <span aria-hidden="true">✓</span> {example.badge}
                <span className="absolute w-[5px] h-[5px] bg-[#8a9d73] -top-[3px] -left-[3px]" />
                <span className="absolute w-[5px] h-[5px] bg-[#8a9d73] -top-[3px] -right-[3px]" />
                <span className="absolute w-[5px] h-[5px] bg-[#8a9d73] -bottom-[3px] -left-[3px]" />
                <span className="absolute w-[5px] h-[5px] bg-[#8a9d73] -bottom-[3px] -right-[3px]" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2.5 font-mono text-[7px] leading-[normal] text-[#959b88]">
              <span className="text-[15px] text-[#abb29c]">+</span> OBSERVED. EXECUTED. VERIFIED.
              <span className="text-[15px] text-[#abb29c]">+</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-4 px-5 border-t border-t-[#dfe3d4] bg-[#f0f3e9] text-[#7a8865] text-[9px] [&_>_span]:flex [&_>_span]:items-center [&_>_span]:gap-2 [&_strong]:font-mono [&_strong]:text-[10px] [&_strong]:leading-[normal] [&_strong_>_span]:ml-2.5">
            <span>
              <span className="status-dot inline-block flex-none h-1.5 w-1.5 rounded-full bg-[#78a576]" />{' '}
              预期结果与页面证据一致
            </span>
            <strong>
              PASS <span aria-hidden="true">↗</span>
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
