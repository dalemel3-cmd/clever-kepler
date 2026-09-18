const fs = require('fs');
const content = fs.readFileSync('src/App.jsx', 'utf8');

const imports = `import { AppSidebar } from './components/AppSidebar';
import { AppHeader } from './components/AppHeader';`;

let newContent = content;
if (!newContent.includes(imports)) {
  newContent = newContent.replace("import './styles.css';", "import './styles.css';\n" + imports);
}

const oldSidebarStr = '      {/* Sidebar (Desktop Only - Hidden in Kiosk Mode) */}';
const scrollAreaStr = '        {/* Scroll Area */}';

const sidebarIdx = newContent.indexOf(oldSidebarStr);
const scrollIdx = newContent.indexOf(scrollAreaStr, sidebarIdx);

if (sidebarIdx === -1 || scrollIdx === -1) {
  console.log('Could not find markers', sidebarIdx, scrollIdx);
  process.exit(1);
}

// Find the end of the scroll area div declaration which is:
//          style={{ position: 'relative' }}
//        >
const endOfScrollAreaDiv = newContent.indexOf('>', scrollIdx);

newContent = newContent.substring(0, sidebarIdx) + `
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
` + newContent.substring(endOfScrollAreaDiv + 1);

newContent = newContent.replace(`      )}
    </div>
  );
}`, `      )}
        </main>
      </div>
    </div>
  );
}`);

fs.writeFileSync('src/App.jsx', newContent);
console.log('Layout replaced successfully!');
