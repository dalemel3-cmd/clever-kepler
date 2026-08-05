export const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'rgba(6, 28, 65, 0.85)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '12px', borderRadius: '8px', color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
        <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>{label}</p>
        <p style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: payload[0].color || 'var(--color-accent)' }}>
          {payload[0].value} {payload[0].name === 'Weight' ? 'lbs' : 'hrs'}
        </p>
      </div>
    );
  }
  return null;
};
