<template>
  <div class="pref-image-uploader">
    <h5>{{ $tr('Uploader') }}</h5>
    <section class="current-uploader">
      <div v-if="isValidUploaderService(currentUploader)">{{ $tr('The current image uploader is') }}
        {{ getServiceNameById(currentUploader) }}.</div>
      <span v-else>{{ $tr('Currently no uploader is selected. Please select and configure one.') }}</span>
    </section>
    <section class="configration">
      <cur-select :value="currentUploader" :options="uploaderOptions"
        :onChange="value => setCurrentUploader(value)"></cur-select>
      <div class="picgo" v-if="currentUploader === 'picgo'">
        <div v-if="!picgoExists" class="warning">
          {{ $tr('Your system does not have') }} <span class="link"
            @click="open('https://github.com/PicGo/PicGo-Core')">picgo</span> {{ $tr('installed. Please install it before use.') }}
        </div>
      </div>
      <div class="github" v-if="currentUploader === 'github'">
        <div class="warning">{{ $tr('GitHub uploader will be removed in a future version. Please use PicGo.') }}</div>
        <div class="form-group">
          <div class="label">
            {{ $tr('GitHub token:') }}
            <el-tooltip class="item" effect="dark"
              :content="$tr('The token is stored in the operating system credential manager.')"
              placement="top-start">
              <info-icon></info-icon>
            </el-tooltip>
          </div>
          <el-input v-model="githubToken" :placeholder="$tr('Input token')" size="small"></el-input>
        </div>
        <div class="form-group">
          <div class="label">{{ $tr('Owner name:') }}</div>
          <el-input v-model="github.owner" :placeholder="$tr('owner')" size="small"></el-input>
        </div>
        <div class="form-group">
          <div class="label">{{ $tr('Repo name:') }}</div>
          <el-input v-model="github.repo" :placeholder="$tr('repo')" size="small"></el-input>
        </div>
        <div class="form-group">
          <div class="label">{{ $tr('Branch name (optional):') }}</div>
          <el-input v-model="github.branch" :placeholder="$tr('branch')" size="small"></el-input>
        </div>
        <legal-notices-checkbox class="github"
          :class="[{ 'error': legalNoticesErrorStates.github }]"
          :uploaderService="uploadServices.github"></legal-notices-checkbox>
        <div class="form-group">
          <el-button size="small" :disabled="githubDisable" @click="save('github')">{{ $tr('Save') }}
          </el-button>
        </div>
      </div>
      <div class="script" v-else-if="currentUploader === 'cliScript'">
        <div class="description">{{ $tr('The script receives the image file path as its only argument and must output a valid image URL.') }}</div>
        <div class="form-group">
          <div class="label">{{ $tr('Shell script location:') }}</div>
          <el-input v-model="cliScript" :placeholder="$tr('Script absolute path')" size="small"></el-input>
        </div>
        <div class="form-group">
          <el-button size="small" :disabled="cliScriptDisable" @click="save('cliScript')">{{ $tr('Save') }}
          </el-button>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import services, { isValidService } from './services.js'
import { mapActions, mapState } from 'pinia'
import legalNoticesCheckbox from './legalNoticesCheckbox.vue'
import filesystem from '@/services/nativeApi/filesystem'
import { isFileExecutable } from '@/util/fileSystem'
import InfoIcon from '@/prefComponents/common/infoIcon.vue'
import CurSelect from '@/prefComponents/common/select/index.vue'
import notice from '@/services/notification'
import { usePreferencesStore } from '@/stores/preferences'

export default {
  components: {
    InfoIcon,
    legalNoticesCheckbox,
    CurSelect
  },
  data () {
    this.uploaderOptions = Object.keys(services).map(name => {
      const { name: label } = services[name]
      return {
        label,
        value: name
      }
    })
    return {
      githubToken: '',
      github: {
        owner: '',
        repo: '',
        branch: ''
      },
      cliScript: '',
      cliScriptExecutable: false,
      cliScriptCheckId: 0,
      picgoExists: true,
      uploadServices: services,
      legalNoticesErrorStates: {
        github: false
      }
    }
  },
  computed: {
    ...mapState(usePreferencesStore, {
      currentUploader: 'currentUploader',
      imageBed: 'imageBed',
      prefGithubToken: 'githubToken',
      prefCliScript: 'cliScript'
    }),
    githubDisable () {
      return !this.githubToken || !this.github.owner || !this.github.repo
    },
    cliScriptDisable () {
      if (!this.cliScript) {
        return true
      }
      return !this.cliScriptExecutable
    }
  },
  watch: {
    imageBed: function (value, oldValue) {
      if (value !== oldValue) {
        this.github = value.github
      }
    },
    cliScript () {
      this.updateCliScriptExecutable()
    }
  },
  created () {
    this.$nextTick(() => {
      this.github = this.imageBed.github
      this.githubToken = this.prefGithubToken
      this.cliScript = this.prefCliScript
      this.updateCliScriptExecutable()
      this.testPicgo()

      if (services.hasOwnProperty(this.currentUploader)) {
        services[this.currentUploader].agreedToLegalNotices = true
      }
    })
  },
  methods: {
    ...mapActions(usePreferencesStore, ['setUserData']),
    isValidUploaderService (name) {
      return isValidService(name)
    },

    getServiceNameById (id) {
      const service = services[id]
      return service ? service.name : id
    },

    open (link) {
      this.$nativeApi.shell.openExternal(link)
    },

    save (type) {
      if (!this.validate(type)) {
        return
      }
      const newImageBedConfig = Object.assign({}, this.imageBed, { [type]: this[type] })
      this.setUserData({
        type: 'imageBed',
        value: newImageBedConfig
      })
      if (type === 'github') {
        this.setUserData({
          type: 'githubToken',
          value: this.githubToken
        })
      }
      if (type === 'cliScript') {
        this.setUserData({
          type: 'cliScript',
          value: this.cliScript
        })
      }
      notice.notify({
        title: 'Save Config',
        message: type === 'github' ? 'The Github configration has been saved.' : 'The command line script configuration has been saved',
        type: 'primary'
      })
    },

    setCurrentUploader (value) {
      this.setUserData({ type: 'currentUploader', value })
    },

    async testPicgo () {
      this.picgoExists = await filesystem.commandExists('picgo')
    },
    async updateCliScriptExecutable () {
      const currentPath = this.cliScript
      const checkId = ++this.cliScriptCheckId
      const isExecutable = currentPath
        ? await isFileExecutable(currentPath)
        : false

      if (checkId !== this.cliScriptCheckId || currentPath !== this.cliScript) {
        return
      }

      this.cliScriptExecutable = isExecutable
    },

    validate (value) {
      const service = services[value]
      const { agreedToLegalNotices } = service
      if (!agreedToLegalNotices) {
        this.legalNoticesErrorStates[value] = true
        return false
      }
      if (this.legalNoticesErrorStates[value] !== undefined) {
        this.legalNoticesErrorStates[value] = false
      }

      return true
    }
  }
}
</script>

<style>
.pref-image-uploader {
  color: var(--editorColor);
  font-size: 14px;

  & .current-uploader {
    margin: 20px 0;
  }
  & .warning {
    color: var(--deleteColor);
  }
  & .link {
    color: var(--themeColor);
    cursor: pointer;
  }
  & .description {
    margin-top: 20px;
    margin-bottom: 20px;
  }
  & .form-group {
    margin: 20px 0 0 0;
  }
  & .label {
    margin-bottom: 10px;
  }
  & .pref-info-icon {
    margin-left: 4px;
    color: var(--iconColor);
    cursor: pointer;
  }
  & .el-input__inner {
    background: transparent;
  }
  & .el-button.btn-reset,
  & .button-group {
    margin-top: 30px;
  }
  & .pref-cb-legal-notices {
    &.github {
      margin-top: 30px;
    }
    &.error {
      border: 1px solid var(--deleteColor);
    }
  }
}
</style>
