import type { NodePlugin } from './api';

export const excelAcceptance: NodePlugin = {
  id: 'excel-ui-acceptance',
  accepts: (node) => node.type === 'screenshot',
  async execute({ nodes, groups, readAsset }) {
    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const usedNames = new Set<string>();

    for (const [index, group] of groups.entries()) {
      const base =
        group.name
          .replace(/[\\/*?:\[\]]/g, ' ')
          .replace(/^'+|'+$/g, '')
          .trim() || `Group ${index + 1}`;
      let name = base.slice(0, 31);
      let suffix = 1;

      while (usedNames.has(name.toLowerCase())) {
        const ending = ` (${suffix++})`;

        name = base.slice(0, 31 - ending.length) + ending;
      }

      usedNames.add(name.toLowerCase());
      const sheet = workbook.addWorksheet(name);

      sheet.columns = [
        { header: '节点 / Node', width: 28 },
        { header: '输入 / Input', width: 45 },
        { header: '输出 / Output', width: 45 },
        { header: '截图 / Screenshot', width: 55 },
        { header: '验收结果 / Acceptance', width: 22 },
        { header: '备注 / Notes', width: 35 },
      ];
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.getRow(1).font = { bold: true };
      for (const id of group.nodeIds) {
        const node = nodes.find((item) => item.id === id)!;
        const assets = node.assets.filter((asset) => asset.kind === 'screenshot');

        if (!assets.length) throw new Error(`截图不可用 / Screenshot unavailable: ${node.title}`);
        for (const asset of assets) {
          const blob = await readAsset(asset.id);
          const extension =
            blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpeg' : undefined;

          if (!extension) throw new Error(`不支持的截图格式 / Unsupported image: ${blob.type}`);
          const row = sheet.addRow([
            node.title,
            JSON.stringify(node.input, null, 2),
            JSON.stringify(node.output, null, 2),
            '',
            '',
            '',
          ]);

          row.height = 180;
          row.alignment = { vertical: 'top', wrapText: true };
          const bitmap = await createImageBitmap(blob);
          const scale = Math.min(380 / bitmap.width, 225 / bitmap.height, 1);
          const ext = { width: bitmap.width * scale, height: bitmap.height * scale };

          bitmap.close();
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';

          for (const byte of bytes) binary += String.fromCharCode(byte);
          const image = workbook.addImage({
            base64: `data:${blob.type};base64,${btoa(binary)}`,
            extension,
          });

          sheet.addImage(image, { tl: { col: 3, row: row.number - 1 }, ext });
          row.getCell(5).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"通过 / Pass,不通过 / Fail"'],
          };
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return {
      files: [
        {
          name: 'ui-acceptance.xlsx',
          blob: new Blob([new Uint8Array(buffer)], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        },
      ],
    };
  },
};
