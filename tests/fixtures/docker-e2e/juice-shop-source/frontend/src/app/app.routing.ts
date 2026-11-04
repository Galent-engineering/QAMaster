import { Routes } from '@angular/router'
import { AboutComponent } from './about/about.component'
import { SearchResultComponent } from './search-result/search-result.component'
import { LoginComponent } from './login/login.component'
import { ContactComponent } from './contact/contact.component'

export const routes: Routes = [
  { path: 'about', component: AboutComponent },
  { path: 'search', component: SearchResultComponent },
  { path: 'login', component: LoginComponent },
  { path: 'contact', component: ContactComponent }
]
