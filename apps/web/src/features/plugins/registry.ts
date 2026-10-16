import { excelAcceptance } from './excelAcceptance';

export const nodePlugins = [{ ...excelAcceptance, messageKey: 'excel-ui-acceptance' as const }];
