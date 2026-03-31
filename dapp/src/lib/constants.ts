export const PACKAGE_ID = "0xdc38becdb1221fdf43444a50b2950bebb3ab47285df8ee756553973995e55670";
export const TREATY_REGISTRY_ID = "0x99b678e3952d2334ed1fc58ecbdd183e5e396fc181e5fcd690de35e9a3a414a0";
export const CLOCK_ID = "0x6";
export const MODULE = "covenant";
export const REGISTRY_MODULE = "treaty_registry";

// Treaty status codes
export const STATUS_PENDING = 0;
export const STATUS_ACTIVE = 1;
export const STATUS_VIOLATED = 2;
export const STATUS_COMPLETED = 3;
export const STATUS_CANCELLED = 4;

export const STATUS_LABELS: Record<number, string> = {
  [STATUS_PENDING]: "PENDING",
  [STATUS_ACTIVE]: "ACTIVE",
  [STATUS_VIOLATED]: "VIOLATED",
  [STATUS_COMPLETED]: "COMPLETED",
  [STATUS_CANCELLED]: "CANCELLED",
};

export const STATUS_COLORS: Record<number, string> = {
  [STATUS_PENDING]: "var(--color-rust)",
  [STATUS_ACTIVE]: "var(--color-gold)",
  [STATUS_VIOLATED]: "var(--color-orange)",
  [STATUS_COMPLETED]: "var(--color-bone-muted)",
  [STATUS_CANCELLED]: "var(--color-bone-muted)",
};
