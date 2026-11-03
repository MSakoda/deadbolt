import type { Settings } from './settings';

export function SettingsModal({ settings, onChange, onClose }: { settings: Settings; onChange(s: Settings): void; onClose(): void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label className="setting">
          <input type="checkbox" checked={settings.dice} onChange={(e) => onChange({ ...settings, dice: e.target.checked })} />
          <span>
            <b>Dice roll animations</b>
            <small className="dim">Show the dice tumbling for each attack, with a hit or miss result. The game log always lists every roll.</small>
          </span>
        </label>
        <label className="setting">
          <input type="checkbox" checked={settings.zombies} onChange={(e) => onChange({ ...settings, zombies: e.target.checked })} />
          <span>
            <b>Zombie phase animation</b>
            <small className="dim">Play the zombie phase step by step: the horde advancing, each bite, sprinters acting again, and every spawn card. Off, it all happens at once.</small>
          </span>
        </label>
        <p><button className="primary" onClick={onClose}>Done</button></p>
      </div>
    </div>
  );
}
