import { Component, type ReactNode } from 'react';
import { useMineStore } from '../store/mineStore';

export class EngineeringErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  override render() {
    if (this.state.error) return <div role="alert" className="m-6 border border-signal-amber bg-ink-950 p-6 text-ink-200">
      <h1 className="text-lg">Engineering model could not evaluate these inputs</h1>
      <p className="my-3 font-mono text-sm">{this.state.error}</p>
      <p className="text-sm">No numerical result should be inferred from this failed evaluation.</p>
      <button className="mt-4 border border-ink-600 p-2" onClick={() => { useMineStore.getState().switchScenario('scn-baseline'); this.setState({ error: null }); }}>Return to reference scenario</button>
    </div>;
    return this.props.children;
  }
}
