import re
import sys

with open('src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to insert the imports at the top
imports = """import { AppSidebar } from './components/AppSidebar';
import { AppHeader } from './components/AppHeader';
"""

content = content.replace("import './styles.css';", "import './styles.css';\n" + imports)

# We want to replace everything from `return (` at line 2268 to the end of the file.
# But we must preserve the content of the scroll-area and the modals.

# Find the start of the return block
return_match = re.search(r'^\s*return\s*\(\s*<div className="app-layout">', content, re.MULTILINE)
if not return_match:
    print("Could not find return block start")
    sys.exit(1)

# Let's just do a simpler string replacement for the layout wrapper.
# 1. Replace the top layout wrapper and sidebar:
old_sidebar_str = """      {/* Sidebar (Desktop Only - Hidden in Kiosk Mode) */}"""
top_nav_str = """      {/* Main Content */}
      <div className="main-content">
        
        {/* Top Header */}"""
scroll_area_str = """        {/* Scroll Area */}
        <div 
          ref={scrollAreaRef}
          className="scroll-area"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ position: 'relative' }}
        >"""

# Find the index of the return start
idx = return_match.start()

# Find the index of the sidebar
sidebar_idx = content.find(old_sidebar_str, idx)
# Find the index of the scroll area
scroll_idx = content.find(scroll_area_str, sidebar_idx)

if sidebar_idx == -1 or scroll_idx == -1:
    print("Could not find sidebar or scroll area markers.")
    sys.exit(1)

# The new layout string that replaces everything from `return (` up to the scroll area.
new_layout_head = """  return (
    <div className="app-layout min-h-screen bg-surface font-body-md text-on-surface">
      {saved && <Confetti />}
      {saved && (
        <div style={{ position: 'fixed', top: '82px', left: '50%', transform: 'translateX(-50%)', zIndex: 10000, background: 'rgba(22, 163, 74, 0.96)', border: '2px solid #86efac', color: '#fff', padding: '12px 28px', borderRadius: '40px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 10px 36px rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(10px)', animation: 'slideDown 0.3s ease' }}>
          <CheckCircle size={24} style={{ flexShrink: 0, color: '#fff' }} />
          <div>
            <span style={{ fontSize: '15px', fontWeight: 800, display: 'block', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {lastSavedWasBaseline ? '🎯 BASELINE SET SUCCESSFULLY!' : 'LOG RECORDED SUCCESSFULLY!'}
            </span>
            {lastSavedAthleteName && <span style={{ fontSize: '12px', opacity: 0.95, fontWeight: 700 }}>{lastSavedAthleteName} &middot; {lastSavedWasBaseline ? 'New Baseline Mass Established & ' : ''}{isOnline ? 'Synced & Live' : 'Cached Offline in Sync Queue'}</span>}
          </div>
        </div>
      )}
      
      {/* Modals from old layout remain here */}
      {showRecoveryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="card-glass glow-card" style={{ width: '100%', maxWidth: '950px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'rgba(13, 27, 46, 0.98)', border: '2px solid #ef4444', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 0 50px rgba(239, 68, 68, 0.35)' }}>
            <div style={{ padding: '24px 28px', background: 'rgba(239, 68, 68, 0.12)', borderBottom: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{ fontSize: '32px' }}>🚨</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    EMERGENCY DATA RECOVERY & STORAGE AUDIT STATION
                  </h2>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                    Scanning iPad local databases, offline queues, and memory caches for weigh-in logs...
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setShowRecoveryModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                ✕ Close Window
              </button>
            </div>
            <div style={{ padding: '24px 28px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
               {/* Simplified the huge modal just for script space, leaving it out actually breaks it if user opens it, so let's keep original */}
            </div>
          </div>
        </div>
      )}

      {!isKioskMode && <AppSidebar screen={screen} setScreen={setScreen} getDailyAlerts={() => []} />}
      
      <div className={isKioskMode ? "w-full" : "pl-64"}>
        <AppHeader 
          isKioskMode={isKioskMode} 
          setIsKioskMode={setIsKioskMode} 
          setScreen={setScreen}
          isOnline={isOnline}
          isRefreshing={isRefreshing}
          unsyncedQueueCount={unsyncedQueueCount}
          syncOfflineCache={syncOfflineCache}
          handleManualCloudRefresh={handleManualCloudRefresh}
        />
        <main className="relative pt-16 w-full px-space-lg bg-surface min-h-screen">
          <div className="flex flex-col w-full pb-space-xl">
"""

# To safely replace just the layout part without destroying the modal code inside it:
# I will cut from the start of the sidebar to the start of the scroll area.
new_content = content[:sidebar_idx] + """
      {!isKioskMode && <AppSidebar screen={screen} setScreen={setScreen} getDailyAlerts={() => []} />}
      
      <div className={isKioskMode ? "w-full" : "pl-64"}>
        <AppHeader 
          isKioskMode={isKioskMode} 
          setIsKioskMode={setIsKioskMode} 
          setScreen={setScreen}
          isOnline={isOnline}
          isRefreshing={isRefreshing}
          unsyncedQueueCount={unsyncedQueueCount}
          syncOfflineCache={syncOfflineCache}
          handleManualCloudRefresh={handleManualCloudRefresh}
        />
        <main className="relative pt-16 w-full px-space-lg bg-surface min-h-screen" ref={scrollAreaRef} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
""" + content[scroll_idx + len(scroll_area_str):]

# Find the closing tag for the main-content wrapper
# At the end of the file, we have:
#       )}
#     </div>
#   );
# }

new_content = new_content.replace("""
      )}
    </div>
  );
}""", """
      )}
        </main>
      </div>
    </div>
  );
}""")


with open('src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Layout replaced successfully!")
