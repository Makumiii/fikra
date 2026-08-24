export default {
  fetch() {
    return new Response("Fikra test worker");
  },
} satisfies ExportedHandler<Env>;
