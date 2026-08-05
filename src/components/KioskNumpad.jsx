import { X } from 'lucide-react';

export const KioskNumpad = ({ value, onChange }) => {
  const handleKey = (key) => {
    if (key === 'DEL') return onChange(value.slice(0, -1));
    if (key === '.' && value.includes('.')) return;
    onChange(value + key);
  };

  const keys = ['1','2','3','4','5','6','7','8','9','.','0','DEL'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
      {keys.map(k => (
        <button
          key={k}
          onClick={() => handleKey(k)}
          className="btn-primary no-print"
          style={{ height: '70px', fontSize: '28px', fontFamily: 'var(--font-display)', background: 'var(--navy-800)', border: '1px solid var(--navy-600)', color: 'var(--white)' }}
        >
          {k === 'DEL' ? <X size={28} /> : k}
        </button>
      ))}
    </div>
  );
};
