EZ.page('page-login', {
  data: () => ({ email: '', password: '', busy: false }),
  methods: {
    async submit() {
      this.busy = true;
      const result = await EZ.run(() => EZ.api('POST', '/auth/login', { email: this.email, password: this.password }));
      this.busy = false;
      if (result) {
        EZ.setAuth(result.token, result.user);
        EZ.go(EZ.home(result.user.role));
      }
    },
  },
  template: `
  <div class="row justify-content-center"><div class="col-md-5 col-lg-4">
    <div class="card shadow-sm"><div class="card-body p-4">
      <h4 class="mb-1">Exam<span class="text-primary">Z</span>Hub</h4><p class="text-muted">Sign in to continue</p>
      <form @submit.prevent="submit">
        <input class="form-control mb-3" type="email" v-model="email" placeholder="Email" required autocomplete="username">
        <input class="form-control mb-3" type="password" v-model="password" placeholder="Password" required autocomplete="current-password">
        <button class="btn btn-primary w-100" :disabled="busy">{{ busy ? 'Signing in...' : 'Login' }}</button>
      </form>
      <div class="text-center mt-3 small">New student? <a href="#/register">Register</a></div>
    </div></div>
  </div></div>`,
});

EZ.page('page-register', {
  data: () => ({ form: { name: '', email: '', password: '', roll_no: '', phone: '' }, busy: false }),
  methods: {
    async submit() {
      this.busy = true;
      const result = await EZ.run(() => EZ.api('POST', '/auth/register', this.form), 'Welcome to ExamZHub');
      this.busy = false;
      if (result) {
        EZ.setAuth(result.token, result.user);
        EZ.go(EZ.home(result.user.role));
      }
    },
  },
  template: `
  <div class="row justify-content-center"><div class="col-md-6 col-lg-5">
    <div class="card shadow-sm"><div class="card-body p-4">
      <h4>Student registration</h4>
      <form @submit.prevent="submit">
        <input class="form-control mb-2" v-model="form.name" placeholder="Full name" required minlength="2">
        <input class="form-control mb-2" type="email" v-model="form.email" placeholder="Email" required>
        <input class="form-control mb-2" type="password" v-model="form.password" placeholder="Password (min 6)" required minlength="6">
        <input class="form-control mb-2" v-model="form.roll_no" placeholder="Roll number (optional)">
        <input class="form-control mb-3" v-model="form.phone" placeholder="Phone (optional)" pattern="[0-9+ -]{7,15}" title="7 to 15 digits">
        <button class="btn btn-primary w-100" :disabled="busy">{{ busy ? 'Registering...' : 'Register' }}</button>
      </form>
      <div class="text-center mt-3 small">Have an account? <a href="#/login">Login</a></div>
    </div></div>
  </div></div>`,
});
