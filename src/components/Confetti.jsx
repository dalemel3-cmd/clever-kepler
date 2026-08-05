import React from 'react';

// Premium Celebratory Confetti Component
export const Confetti = () => {
  const particles = React.useMemo(() => {
    const colors = ['#b89c5b', '#ffffff', '#061c41', '#e0c380', '#3b82f6'];
    return Array.from({ length: 45 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      size: Math.random() * 8 + 6,
      color: colors[i % colors.length],
      duration: Math.random() * 1.5 + 1.2,
      delay: Math.random() * 0.4,
      rotation: Math.random() * 360,
      shape: i % 3 === 0 ? '50%' : '2px'
    }));
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 9999 }}>
      {particles.map(p => (
        <div key={p.id} style={{
          position: 'absolute',
          width: `${p.size}px`,
          height: `${p.size}px`,
          backgroundColor: p.color,
          borderRadius: p.shape,
          top: '-20px',
          left: `${p.left}%`,
          boxShadow: `0 0 8px ${p.color}`,
          animation: `confettiFall ${p.duration}s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
          animationDelay: `${p.delay}s`,
          transform: `rotate(${p.rotation}deg)`
        }} />
      ))}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          80% { opacity: 1; }
          100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
