import { Component } from '@angular/core';
@Component({ selector: 'app-home', templateUrl: './home.component.html' })
export class HomeComponent {
  constructor(private router: Router) {}
  open(id: number) { this.router.navigate(['/orders', id]); }
}
