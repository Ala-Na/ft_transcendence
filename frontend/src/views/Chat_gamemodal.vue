<template>
  <div class="bloc-modale" v-if="showGameModal">
    <div class="overlay"></div>
    <div class="modale card">
      <v-card>
        <v-card-title>
          <span class="text-h5">Game invitation from {{ inviterName }}</span>
        </v-card-title>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="red darken-1" text @click="toggleGameModal">
            Refuse
          </v-btn>
          <v-btn color="blue darken-1" text @click="respondToGame">
            Accept
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
  </div>
</template>


<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent ({
  name: "GameModal",
  props: ["showGameModal", "toggleGameModal", "inviterName"],
  setup(props, { emit }) {

    function respondToGame() {
      emit('response', true);
    }

    return { respondToGame };
  }
});
</script> 

<style scoped>
.bloc-modale {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.overlay {
  background: rgba(0, 0, 0, 0.5);
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: 0px;
  width:100%;
  height:100%;
}

.modale {
  background: #f1f1f1;
  color: #333;
  padding: 3px;
  border-radius:5px;
  position: fixed;
  top: 45%;
}

.btn-modale {
  position: absolute;
  border-radius:60px;
  top: 10px;
  right: 10px;
}
</style>
