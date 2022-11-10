import { NxWelcomeComponent } from './nx-welcome.component';
import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    component: NxWelcomeComponent,
  },
  {
    path: 'remote2',
    loadChildren: () =>
      import('remote2/Module').then((m) => m.RemoteEntryModule),
  },
  {
    path: 'remote1',
    loadChildren: () =>
      import('remote1/Module').then((m) => m.RemoteEntryModule),
  },
];
