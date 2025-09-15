import { ThemeProvider } from '@/app/components/theme-provider';
import Titlebar from '@/app/components/titlebar';
import { useRendererListener } from '@/app/hooks';
import { SplashScreen } from '@/app/screens/splash';
import { InstallerScreen } from '@/app/screens/installer';
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
              <Route path='/installer' Component={InstallerScreen} />
            </Routes>
          </main>
        </div>
      </Router>
    </ThemeProvider>
  );
}
