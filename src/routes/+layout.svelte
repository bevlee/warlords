<script>
  import '../app.css';
  import KeywordPopup from '$lib/ui/keyword/KeywordPopup.svelte';
</script>

<slot />

<!-- One shared popup for every keyword in the app, in the top layer so no
     scrolling panel can clip it. -->
<KeywordPopup />
