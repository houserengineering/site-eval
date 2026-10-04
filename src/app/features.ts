// Live scope (Nathan, 2026-10-04): the field app delivers the test pit soil log PDF and nothing beyond
// it. These modules are switched off here and their code is kept; the full app, with all of them on,
// is the `beta` branch, which is never deployed. Records keep any perc, well or confirm-on-site data.
export const FEATURES = {
  /** Perc tests, perc timers, perc PDF/Excel, PE certification and the Settings toggle that shows them. */
  PERC: false,
  /** Groundwater monitoring: observation wells, readings and the groundwater results PDF/Excel. */
  GROUNDWATER: false,
  /** The texture-by-feel guide under Texture. */
  TEXTURE_GUIDE: false,
  /** DEQ-4 rule warnings: "Rule checks before export" and each wall's rule list. */
  RULE_WARNINGS: false,
  /** "(UNCONFIRMED)" on office-prefilled header values, and the on-screen Confirm on site notice. */
  UNCONFIRMED_MARKS: false,
} as const;
