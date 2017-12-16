
/**
 * Sequence of Actions that needs to be atomically sent (i.e. with single command) to workers.
 * 
 * This is necessary for two reasons:
 * 1. Preventing worker breakage. Very common pattern is [start, stop].
 * 2. Providing fake physics.
 * 
 * Some of the movement (e.g. goto origin) is difficult to model with proper physics yet.
 * In the mean while, ActionSeq provides fake physics specific to the actionSeq.
 * 
 * Reason 2 should be gone eventually, as we make sensor data collectible and incorporate
 * ML-based physics simulation.
 */
export class ActionSeq {
    constructor(public actions: Array<Action>, private t0: number, private t1: number, public label: string = "") {
    }

    getT0(): number {
        return this.t0;
    }

    getLabel(): string {
        if (this.label) {
            return this.label;
        } else {
            return this.actions.map(a => a.action).join(',');
        }
    }

    getFullDesc(): string {
        return this.actions.map(a => a.action).join(',');
    }

    getDurationSec(): number {
        return this.actions.map(action => action.getDurationSec()).reduce((a, b) => a + b, 0);
    }
}

/**
 * Single worker action. Execution time is bounded.
 * 
 * Human readable format:
 * <dur: int> <special: char>* (<target: char><value: int>)+
 * 
 * Examples:
 * Simple: 500a29
 * Two-target: 300t0a11
 * Special: 1!t0 (!: report sensor data)
 */
export class Action {
    private durSec: number;

    constructor(public readonly action: string) {
        const m = /^([0-9]+)/.exec(action);
        if (m) {
            this.durSec = parseInt(m[1]) * 1e-3;
        } else {
            this.durSec = 500e-3;
        }
    }

    getAction(): string {
        return this.action;
    }

    getDurationSec(): number {
        return this.durSec;
    }
}
