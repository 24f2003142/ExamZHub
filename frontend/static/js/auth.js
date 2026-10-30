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
  <div class="auth-page"><div class="auth-brand"><a href="#/login" aria-label="ExamZHub">Exam<span>Z</span>Hub</a></div><div class="row justify-content-center w-100"><div class="col-sm-10 col-md-6 col-lg-4">
    <div class="card auth-card rounded-4"><div class="card-body p-4 p-md-5">
      <h4 class="mb-1">Welcome back</h4><p class="text-muted mb-4">Let's get you in.</p>
      <form @submit.prevent="submit">
        <input class="form-control mb-3" type="email" v-model="email" placeholder="Email" required autocomplete="username">
        <input class="form-control mb-3" type="password" v-model="password" placeholder="Password" required autocomplete="current-password">
        <button class="btn btn-primary w-100" :disabled="busy">{{ busy ? 'Signing you in...' : 'Log in' }}</button>
      </form>
      <div class="text-center mt-3 small">New student? <a href="#/register">Register</a></div>
    </div></div>
  </div></div>`,
});

EZ.page('page-register', {
  data: () => ({ form: { name: '', email: '', password: '', roll_no: '', phone: '', department_id: '', year: '', semester: '' }, departments: [], busy: false }),
  async mounted() { const data = await EZ.run(() => EZ.api('GET', '/departments')); if (data) this.departments = data.departments.filter(department => department.is_active); },
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
  <div class="auth-page"><div class="auth-brand"><a href="#/login" aria-label="ExamZHub">Exam<span>Z</span>Hub</a></div><div class="row justify-content-center w-100"><div class="col-sm-10 col-md-7 col-lg-5">
    <div class="card auth-card rounded-4"><div class="card-body p-4 p-md-5">
      <h4 class="mb-1">Student registration</h4><p class="text-muted mb-4">Create your ExamZHub account</p>
      <form @submit.prevent="submit">
        <input class="form-control mb-2" v-model="form.name" placeholder="Full name" required minlength="2">
        <input class="form-control mb-2" type="email" v-model="form.email" placeholder="Email" required>
        <input class="form-control mb-2" type="password" v-model="form.password" placeholder="Password (min 6)" required minlength="6">
        <select class="form-select mb-2" v-model.number="form.department_id" required><option value="" disabled>Choose your department</option><option v-for="department in departments" :key="department.id" :value="department.id">{{ department.code }} - {{ department.name }}</option></select>
        <div class="row g-2"><div class="col-6"><select class="form-select mb-2" v-model.number="form.year" required><option value="" disabled>Year</option><option v-for="value in 6" :key="value" :value="value">Year {{ value }}</option></select></div><div class="col-6"><select class="form-select mb-2" v-model.number="form.semester" required><option value="" disabled>Semester</option><option v-for="value in 12" :key="value" :value="value">Semester {{ value }}</option></select></div></div>
        <input class="form-control mb-2" v-model="form.roll_no" placeholder="Roll number (optional)">
        <input class="form-control mb-3" v-model="form.phone" placeholder="Phone (optional)" pattern="[0-9+ -]{7,15}" title="7 to 15 digits">
        <button class="btn btn-primary w-100" :disabled="busy">{{ busy ? 'Registering...' : 'Register' }}</button>
      </form>
      <div class="text-center mt-3 small">Have an account? <a href="#/login">Login</a></div>
    </div></div>
  </div></div>`,
});
