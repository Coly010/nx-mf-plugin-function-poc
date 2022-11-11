import { NxWelcomeComponent } from './nx-welcome.component';
import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    component: NxWelcomeComponent,
  },
  {
    path: 'plugin-remote2',
    loadChildren: () =>
      import('plugin-remote2/Module').then((m) => m.RemoteEntryModule),
  },
  {
    path: 'plugin-remote1',
    loadChildren: () =>
      import('plugin-remote1/Module').then((m) => m.RemoteEntryModule),
  },
];
