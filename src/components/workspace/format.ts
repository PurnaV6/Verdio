export const fmtN = (n: number) => Math.round(n).toLocaleString('en-GB');

export const formatExecutiveCurrency=(value:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',notation:'compact',maximumFractionDigits:1}).format(value);
