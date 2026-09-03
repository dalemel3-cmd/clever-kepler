// Shared Recharts tooltip. Originally written only for ProfilesScreen's weight chart,
// so it hardcoded "'Weight' -> lbs, anything else -> hrs". Every other series name
// silently fell into that "anything else", which is how Analytics ended up labelling
// its weight trend "hrs" and its compliance percentage "hrs" too.
//
// `units` lets a caller declare the real unit per series name (e.g. { 'Avg Weight':
// 'lbs', Compliance: '%' }). A name not listed there falls back to sniffing for
// "weight" -> lbs, else no suffix at all - never a guessed "hrs" for a value that was
// never a duration.
const guessUnit = (name) => (/weight/i.test(name || '') ? 'lbs' : '');

export const CustomTooltip = ({ active, payload, label, units = {} }) => {
  if (active && payload && payload.length) {
    const name = payload[0].name;
    const unit = units[name] !== undefined ? units[name] : guessUnit(name);
    return (
      <div style={{ background: 'rgba(6, 28, 65, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '8px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
        <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>{label}</p>
        <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: payload[0].color || 'var(--color-accent)' }}>
          {payload[0].value}{unit ? ` ${unit}` : ''}
        </p>
      </div>
    );
  }
  return null;
};
