// Beta branch: the full app, every module on. Never deployed (Pages deploys main only). On live main
// these are all false (Nathan, 2026-10-04: the field app delivers the test pit soil log PDF only).
export const FEATURES = {
  /** Perc tests, perc timers, perc PDF/Excel, PE certification and the Settings toggle that shows them. */
  PERC: true,
  /** Groundwater monitoring: observation wells, readings and the groundwater results PDF/Excel. */
  GROUNDWATER: true,
  /** The texture-by-feel guide under Texture. */
  TEXTURE_GUIDE: true,
  /** DEQ-4 rule warnings: "Rule checks before export" and each wall's rule list. */
  RULE_WARNINGS: true,
  /** "(UNCONFIRMED)" on office-prefilled header values, and the on-screen Confirm on site notice. */
  UNCONFIRMED_MARKS: true,
} as const;
