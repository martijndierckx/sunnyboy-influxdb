export type SMARegisters = {
  DC: {
    A: {
      watt: number;
      volt: number;
      amp: number;
    };
    B: {
      watt: number;
      volt: number;
      amp: number;
    };
  };
  AC: {
    watt: number;
    frequency: number;
    L1: {
      volt: number;
      amp: number;
    };
    L2: {
      volt: number;
      amp: number;
    };
    L3: {
      volt: number;
      amp: number;
    };
    L1L2: {
      volt: number;
    };
    L2L3: {
      volt: number;
    };
    L3L1: {
      volt: number;
    };
  };
  dayYield: {
    kwh: number;
  };
  totalYield: {
    kwh: number;
  };
};
