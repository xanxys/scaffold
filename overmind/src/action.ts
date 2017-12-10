
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
    constructor(public actions: Array<Action>) {
    }

    getLabel(): string {
        return "asq";
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

    constructor(private action: string) {
        this.durSec = parseInt(/^([0-9]+)/.exec(action)[1]) * 1e-3;
    }

    getAction(): string {
        return this.action;
    }

    getDurationSec(): number {
        return this.durSec;
    }
}
