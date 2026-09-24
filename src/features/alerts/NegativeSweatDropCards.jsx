import { getAthleteBaseline, getCentralDateString, isPostPracticeLog } from '../../utils/athleteData';


// Post-practice negative sweat-drop alert cards (Alerts + Reports). Split out of
// App.jsx, which still owns the data and passes it in.
export function NegativeSweatDropCards({
  forceShow = false,
  maxAgeDays = null,
  athletes,
  fetchProfileData,
  reportData,
  screen,
  setScreen,
  setSelectedProfileId,
  settings,
}) {
  const list = [];
  const now = new Date();
  const shouldShowEmpty = forceShow || screen === 'reports';
  const effectiveMaxAgeDays = maxAgeDays != null ? maxAgeDays : settings.postPracticeLookbackDays;

  athletes.forEach(ath => {
    const athLogs = reportData.filter(r => (r.athlete_id === ath.id || (r.athlete_name && r.athlete_name.trim().toLowerCase() === ath.name.trim().toLowerCase())) && r.weight_lbs && Number(r.weight_lbs) > 0);
    const ppLogs = athLogs.filter(r => isPostPracticeLog(r)).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    if (ppLogs.length === 0) return;

    const latestPP = ppLogs[ppLogs.length - 1];
    const daysOld = (now - new Date(latestPP.created_at)) / (1000 * 60 * 60 * 24);
    if (daysOld > effectiveMaxAgeDays && !shouldShowEmpty) return;

    const normalLogs = athLogs.filter(r => !isPostPracticeLog(r)).sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const ppDate = new Date(latestPP.created_at);
    const ppDateCentralStr = getCentralDateString(ppDate);

    const sameDayLogs = normalLogs.filter(wl => getCentralDateString(new Date(wl.created_at)) === ppDateCentralStr);
    
    let bWeight = null;
    if (sameDayLogs.length > 0) {
      bWeight = parseFloat(sameDayLogs[sameDayLogs.length - 1].weight_lbs);
    } else {
      const priorLogs = normalLogs.filter(wl => new Date(wl.created_at) <= ppDate);
      if (priorLogs.length > 0) {
        bWeight = parseFloat(priorLogs[priorLogs.length - 1].weight_lbs);
      } else {
        const baseInfo = getAthleteBaseline(ath, reportData);
        bWeight = baseInfo ? parseFloat(baseInfo.weight_lbs) : (ath.baseline_weight ? parseFloat(ath.baseline_weight) : (normalLogs.length ? parseFloat(normalLogs[normalLogs.length - 1].weight_lbs) : null));
      }
    }
    
    const pWeight = parseFloat(latestPP.weight_lbs);
    const drop = bWeight ? (bWeight - pWeight) : 0;
    
    if (drop > 0) {
      const pctLoss = bWeight && bWeight > 0 ? ((drop / bWeight) * 100) : 0;
      const fluidOz = Math.round(drop * settings.fluidOzPerLb);
      const isSevere = drop >= settings.severeSweatLbs || pctLoss >= settings.severeSweatPct;
      
      list.push({
        athlete: ath,
        log: latestPP,
        pDate: new Date(latestPP.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pTime: new Date(latestPP.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        pWeight,
        bWeight,
        drop,
        pctLoss,
        fluidOz: fluidOz > 0 ? fluidOz : settings.minFluidOz,
        isSevere
      });
    }
  });

  list.sort((a, b) => b.drop - a.drop);

  if (list.length === 0 && !shouldShowEmpty) return null;

  return (
    <div className="card-glass" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', borderLeft: '4px solid #ef4444', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444', letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            ⚡ ACUTE EXERTIONAL MONITORING
          </div>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: '#fff', textTransform: 'uppercase' }}>
            POST-PRACTICE SWEAT LOSS & HYDRATION ALERTS (IN THE NEGATIVE)
          </h3>
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Athletes experiencing acute weight loss during practice sessions requiring urgent fluid replacement before tomorrow.
          </span>
        </div>
        <span style={{ padding: '6px 12px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', fontSize: '12px', fontWeight: 800 }}>
          {list.length} {list.length === 1 ? 'ATHLETE IN NEGATIVE' : 'ATHLETES IN NEGATIVE'}
        </span>
      </div>

      {list.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
          Clean! No athletes currently showing acute post-practice sweat loss in the negative.
        </div>
      ) : (
        <>
          {/* Screen View: Interactive Cards */}
          <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
            {list.map((item, idx) => (
              <div 
                key={item.log.id || idx} 
                onClick={() => {
                  setSelectedProfileId(item.athlete.id);
                  fetchProfileData(item.athlete.id);
                  setScreen('profiles');
                }}
                style={{ 
                  padding: '18px 24px', 
                  borderRadius: '16px', 
                  background: 'rgba(0, 0, 0, 0.45)', 
                  border: item.isSevere ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid rgba(255,255,255,0.1)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between', 
                  flexWrap: 'wrap', 
                  gap: '16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                className="hover-card"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: '160px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: '#fff' }}>
                        {item.athlete.name}
                      </span>
                      {item.athlete.position && (
                        <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', color: 'var(--color-accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          {item.athlete.position}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', display: 'block' }}>
                      {item.pDate} · {item.pTime}
                    </span>
                  </div>
                  <div style={{ height: '36px', width: '1px', background: 'rgba(255,255,255,0.1)' }} />
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Pre-Practice / Morning</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--color-text-muted)' }}>{item.bWeight} lbs</span>
                  </div>
                  <div style={{ fontSize: '20px', color: 'var(--color-text-muted)', fontWeight: 800 }}>➔</div>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Post-Practice Weight</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: '#fff' }}>{item.pWeight} lbs</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'block' }}>Acute Sweat Drop</span>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>
                      -{item.drop.toFixed(1)} lbs (-{item.pctLoss.toFixed(1)}%)
                    </span>
                  </div>
                  <div style={{ padding: '8px 16px', borderRadius: '12px', background: item.drop >= 5 ? 'rgba(239, 68, 68, 0.2)' : item.drop > 2 ? 'rgba(249, 115, 22, 0.2)' : 'rgba(59, 130, 246, 0.2)', border: item.drop >= 5 ? '1px solid rgba(239, 68, 68, 0.4)' : item.drop > 2 ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)', color: item.drop >= 5 ? '#ef4444' : item.drop > 2 ? '#f97316' : '#60a5fa', fontWeight: 800, fontSize: '13px' }}>
                    💧 Rx: Drink {item.fluidOz} oz fluids before tomorrow
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* PDF Print Table: Dedicated sharp table for exported PDF documents */}
          <div className="only-print" style={{ display: 'none', width: '100%', marginTop: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(239, 68, 68, 0.1)', borderBottom: '2px solid #ef4444' }}>
                  <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>ATHLETE</th>
                  <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>SPORT / POS</th>
                  <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>PRE-PRACTICE</th>
                  <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>POST-PRACTICE</th>
                  <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>SWEAT DROP</th>
                  <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>HYDRATION Rx (BEFORE TOMORROW)</th>
                  <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>LOG DATE</th>
                </tr>
              </thead>
              <tbody>
                {list.map((item, idx) => (
                  <tr key={item.log.id || idx} style={{ borderBottom: '1px solid #cbd5e1' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 800 }}>{item.athlete.name}</td>
                    <td style={{ padding: '10px 14px', fontSize: '12px' }}>{item.athlete.sport || 'N/A'}{item.athlete.position ? ` (${item.athlete.position})` : ''}</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700 }}>{item.bWeight} lbs</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>{item.pWeight} lbs</td>
                    <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 800, color: '#ef4444' }}>
                      -{item.drop.toFixed(1)} lbs (-{item.pctLoss.toFixed(1)}%)
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 800, color: '#ef4444' }}>
                      💧 Drink {item.fluidOz} oz fluids
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: '12px' }}>{item.pDate} · {item.pTime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
