
/// Single worker action. Execution time is bounded.
/// <dur: int><target: char><value: int>
class Action {
    constructor(private action) {
    }

    getAction(): string {
        return this.action;
    }

    getDurationMs(): number {
        return 20;
    }
}
