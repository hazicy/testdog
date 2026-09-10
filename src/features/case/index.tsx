'use client';

import { Card, Chip, EmptyState, Surface } from '@heroui/react';

export function Case() {
  return (
    <div className="space-y-7">
      <section aria-labelledby="page-title">
        <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-accent">
          TEST MANAGEMENT
        </p>
        <h1
          id="page-title"
          className="text-3xl font-semibold tracking-tight"
        >
          测试用例
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          把重复的操作交给自动化，专注于更好的产品体验。
        </p>
      </section>
      <Surface
        className="flex flex-col justify-between gap-6 rounded-xl border border-accent/15 bg-accent/5 p-5 md:p-7 xl:flex-row xl:items-center"
        aria-labelledby="intro-title"
      >
        <div>
          <span className="text-xs text-accent">从一个场景开始</span>
          <h2
            id="intro-title"
            className="my-3 text-lg font-medium"
          >
            用自然语言，描述你的测试流程。
          </h2>
          <p className="text-xs leading-relaxed text-muted">
            组织测试步骤，让浏览器自动化更直观、更有条理。
          </p>
        </div>
        <ol
          className="flex flex-wrap gap-2"
          aria-label="测试流程"
        >
          {['描述场景', '浏览器执行', '检查结果'].map((step, index) => (
            <li
              key={step}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
            >
              <span className="font-mono text-[10px] text-accent">
                0{index + 1}
              </span>
              <span className="text-[11px] text-muted">{step}</span>
            </li>
          ))}
        </ol>
      </Surface>
      <Card
        className="gap-0 border border-border p-0 shadow-none"
        aria-labelledby="cases-title"
      >
        <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <Card.Title
            id="cases-title"
            className="text-sm"
          >
            用例工作区
          </Card.Title>
          <Chip
            size="sm"
            variant="soft"
          >
            尚未连接数据
          </Chip>
        </Card.Header>
        <Card.Content>
          <EmptyState className="flex min-h-80 flex-col items-center justify-center px-5 py-10 text-center">
            <span
              className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-accent/15 bg-accent/5 text-3xl text-accent"
              aria-hidden="true"
            >
              ▤
            </span>
            <h3 className="text-base font-medium">准备好开始测试了吗？</h3>
            <p className="mt-3 text-xs leading-6 text-muted">
              这里将展示你的测试用例。
              <br />
              接入用例数据后，即可在此管理测试场景。
            </p>
          </EmptyState>
        </Card.Content>
        <Card.Footer className="border-t border-border px-5 py-4 text-[11px] text-muted">
          用例列表与执行结果将在此集中展示
        </Card.Footer>
      </Card>
    </div>
  );
}
