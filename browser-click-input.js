// Browser input only: native selection and fingertip contact describe the
// same physical action. Keep their latches together, separately for each hand.
export class BrowserClickInput {
  states = new WeakMap();
  state(source) {
    if (!this.states.has(source)) this.states.set(source, {selecting:false,used:false,contact:null,contactClicked:false});
    return this.states.get(source);
  }
  begin(source) {
    const s=this.state(source);
    if(s.selecting)return false;
    s.selecting=true;
    return true;
  }
  end(source, pinchClosed=false) {
    const s=this.state(source);s.selecting=false;
    if(!pinchClosed)s.used=false;
  }
  observe(source, pinchClosed) {
    const s=this.state(source);
    if(!s.selecting&&!pinchClosed)s.used=false;
  }
  select(source) {
    const s=this.state(source), allowed=!s.used&&!s.contactClicked;
    s.used=true;
    s.contactClicked=false;
    return allowed;
  }
  contact(source, id) {
    const s=this.state(source);
    if(s.contact===id)return false;
    s.contact=id;
    s.contactClicked=!s.selecting&&!s.used;
    return s.contactClicked;
  }
  contactOf(source) { return this.state(source).contact; }
  leave(source) { const s=this.state(source);s.contact=null;s.contactClicked=false; }
  cancel(source) { this.states.delete(source); }
  reset() { this.states=new WeakMap(); }
}
