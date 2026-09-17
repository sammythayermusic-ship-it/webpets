import type { Ledger } from './types';

function assertAmount(n: number): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`amount must be a non-negative integer, got ${String(n)}`);
  }
}

/** Phase 0 wallet: a plain number. Every mutator validates before touching the balance, so a throw changes nothing. */
export class LocalLedger implements Ledger {
  private bal: number;

  constructor(balance: number) {
    if (!Number.isInteger(balance) || balance < 0) {
      throw new RangeError(`balance must be a non-negative integer, got ${String(balance)}`);
    }
    this.bal = balance;
  }

  balance(): number {
    return this.bal;
  }

  burn(n: number): void {
    assertAmount(n);
    if (n > this.bal) throw new RangeError(`cannot burn ${n}: balance is ${this.bal}`);
    this.bal -= n;
  }

  debit(n: number): void {
    assertAmount(n);
    if (n > this.bal) throw new RangeError(`cannot debit ${n}: balance is ${this.bal}`);
    this.bal -= n;
  }

  credit(n: number): void {
    assertAmount(n);
    this.bal += n;
  }

  toJSON(): number {
    return this.bal;
  }
}
