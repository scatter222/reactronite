import { ThemeProvider } from '@/app/components/theme-provider';
import Titlebar from '@/app/components/titlebar';
import { useRendererListener } from '@/app/hooks';
import { SplashScreen } from '@/app/screens/splash';
import { ChooseScreen } from '@/app/screens/choose';
import { HardwareScreen } from '@/app/screens/hardware';
import { InstallerScreen } from '@/app/screens/installer';
import { VMScreen } from '@/app/screens/vms';
import { MenuChannels } from '@/channels/menuChannels';

import { Route, HashRouter as Router, Routes } from 'react-router-dom';

const onMenuEvent = (_: Electron.IpcRendererEvent, channel: string, ...args: unknown[]) => {
  electron.ipcRenderer.invoke(channel, args);
};

export default function App () {
  useRendererListener(MenuChannels.MENU_EVENT, onMenuEvent);

  return (
    <ThemeProvider defaultTheme='dark' storageKey='vite-ui-theme'>
      <Router>
        <div className='flex flex-col h-full'>
          <Titlebar />
          <main className='flex-1 overflow-auto'>
            <Routes>
              <Route path='/' Component={SplashScreen} />
              <Route path='/choose' Component={ChooseScreen} />
              <Route path='/hardware' Component={HardwareScreen} />
              <Route path='/installer' element={<InstallerScreen configPrefix='installer' />} />
              <Route path='/workstation' element={<InstallerScreen configPrefix='workstation' />} />
              <Route path='/vms' Component={VMScreen} />
            </Routes>
          </main>
        </div>
      </Router>
    </ThemeProvider>
  );
}
