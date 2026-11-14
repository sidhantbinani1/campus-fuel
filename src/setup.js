
// A single setup step; choices are saved by the existing account RPC.
export function mountSetup(el, { schools, onSave, onSignout }) {
  el.innerHTML = `<div class="setup-welcome"><span class="setup-mark">✦</span><p class="eyebrow">ONE LAST THING</p><h1>Make yourself at home.</h1><p>Finish setting up your account to start using University Plates.</p></div>
  <form id="settings-form" class="setup-card">
    <label for="school-search">What school do you go to? <small>Required</small></label>
    <div class="setup-school"><input id="school-search" role="combobox" aria-autocomplete="list" aria-controls="setup-schools" aria-expanded="false" placeholder="Start typing your school…" autocomplete="off" required><div id="setup-schools" role="listbox" aria-label="Matching schools" hidden></div></div>
    <p class="setup-help" id="setup-school-help">Cal Poly SLO menus are available now. Other listed campuses are coming soon.</p>
    <div class="setup-divider"></div><h2>Your place on the Fuel Board</h2><p class="setup-help">Choose how you’d like to take part.</p>
    <label class="setup-choice"><input id="participating" type="radio" name="participation" value="yes" required><span><b>Yes, include me</b><small>See campus trends and include my meal activity in aggregate rankings.</small></span></label>
    <label class="setup-choice"><input type="radio" name="participation" value="no" required><span><b>No thanks, keep my activity private</b><small>I’ll use meal planning and history without campus rankings.</small></span></label>
    <div id="setup-nickname" hidden><label for="nickname">What should we call you?</label><input id="nickname" placeholder="Choose a nickname" minlength="2" maxlength="24" pattern="[A-Za-z0-9 _-]{2,24}" disabled><p class="setup-help">2–24 letters, numbers, spaces, underscores or hyphens.</p>
    <label class="setup-privacy"><input id="hide-nickname" type="checkbox"><span>Do not show my nickname<small id="setup-nickname-help">Your nickname can appear beside qualifying campus rankings.</small></span></label></div>
    <input id="show-nickname" type="checkbox" hidden>
    <p class="setup-private">Your personal nutrition goals and history stay private.</p>
    <label class="setup-privacy setup-terms"><input id="accept-terms" type="checkbox" required><span>I accept the <button type="button" class="text-button" data-legal="terms">Terms of Service</button> and acknowledge the <button type="button" class="text-button" data-legal="privacy">Privacy Notice</button>.</span></label>
    <p id="setup-error" class="setup-error" role="alert" hidden></p>
    <button class="primary setup-submit" type="submit">Finish setup and start tracking <span aria-hidden="true">→</span></button>
    <button class="text-button setup-signout" type="button">Sign out</button>
  </form>`;
  const school = el.querySelector('#school-search'), results = el.querySelector('#setup-schools');
  const nickname = el.querySelector('#nickname'), hide = el.querySelector('#hide-nickname');
  let active = -1;
  const validateSchool = () => {
    const selected = schools.find(s => s.name === school.value);
    school.setCustomValidity(selected ? '' : 'Choose a school from the suggestions.');
    el.querySelector('#setup-school-help').textContent = selected && !selected.menus ? 'Menus for this campus are coming soon. You can still set goals and track your history.' : 'Cal Poly SLO menus are available now. Other listed campuses are coming soon.';
    return selected;
  };
  const close = () => { results.hidden = true; school.setAttribute('aria-expanded', 'false'); school.removeAttribute('aria-activedescendant'); active = -1; };
  const suggest = () => {
    const query = school.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    results.replaceChildren(); active = -1;
    if (!query) return close();
    schools.filter(s => s.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query)).forEach((s, i) => {
      const button = document.createElement('button'); button.type = 'button'; button.role = 'option'; button.id = `setup-school-${i}`; button.tabIndex = -1; button.textContent = s.name; button.setAttribute('aria-selected', 'false');
      button.onmousedown = e => e.preventDefault();
      button.onclick = () => { school.value = s.name; validateSchool(); close(); school.focus(); close(); };
      results.append(button);
    });
    if (!results.children.length) results.innerHTML = '<p>No matching schools in the current campus list.</p>';
    results.hidden = false; school.setAttribute('aria-expanded', 'true');
  };
  school.oninput = () => { school.setCustomValidity(''); suggest(); };
  school.onfocus = suggest;
  school.onblur = () => { close(); if (school.value) validateSchool(); };
  school.onkeydown = e => {
    const buttons = [...results.querySelectorAll('button')];
    if (e.key === 'Escape') close();
    if (['ArrowDown','ArrowUp'].includes(e.key) && buttons.length) {
      e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons.forEach((b,i) => b.setAttribute('aria-selected', String(i === active)));
      school.setAttribute('aria-activedescendant', buttons[active].id); buttons[active].scrollIntoView?.({block:'nearest'});
    }
    if (e.key === 'Enter' && !results.hidden && active >= 0) { e.preventDefault(); buttons[active].click(); }
  };
  const updatePrivacy = () => {
    const participating = el.querySelector('#participating').checked;
    el.querySelector('#setup-nickname').hidden = !participating;
    nickname.disabled = !participating;
    nickname.required = participating && !hide.checked;
    el.querySelector('#show-nickname').checked = participating && !hide.checked;
    el.querySelector('#setup-nickname-help').textContent = hide.checked ? 'Your nickname stays hidden from other students.' : 'Your nickname can appear beside qualifying campus rankings.';
  };
  el.querySelectorAll('[name=participation]').forEach(input => input.onchange = updatePrivacy);
  hide.onchange = updatePrivacy;
  updatePrivacy();
  el.querySelector('.setup-signout').onclick = onSignout;
  el.querySelector('form').onsubmit = async event => {
    event.preventDefault();
    if (!validateSchool() || !event.currentTarget.reportValidity()) return;
    const submit = el.querySelector('.setup-submit'), error = el.querySelector('#setup-error');
    if (submit.disabled) return;
    submit.disabled = true; submit.textContent = 'Saving your setup…'; error.hidden = true;
    try { await onSave(event); }
    catch (e) { error.textContent = e.message || 'Setup could not be saved. Please try again.'; error.hidden = false; }
    finally { submit.disabled = false; submit.innerHTML = 'Finish setup and start tracking <span aria-hidden="true">→</span>'; }
  };
}
