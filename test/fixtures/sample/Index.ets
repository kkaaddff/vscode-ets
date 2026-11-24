import { router } from '@kit.ArkUI';
import hilog from '@ohos.hilog';

@Observed
class Task {
  name: string = '';
  done: boolean = false;
}

@Extend(Text)
function fancy(size: number) {
  .fontSize(size)
  .fontColor(Color.Red)
}

@Styles
function pressed() {
  .backgroundColor('#33000000')
}

@Builder
function Header(title: string) {
  Text(title).fontWeight(FontWeight.Bold)
}

@Entry
@Component
export struct Index {
  @State message: string = 'Hello World';
  @State tasks: Task[] = [];
  @Prop @Watch('onCountChange') count: number = 0;
  @Link selected: boolean;
  @StorageLink('theme') theme: string = 'light';
  @BuilderParam content: () => void = Header;
  private scroller: Scroller = new Scroller();

  aboutToAppear(): void {
    hilog.info(0x0000, 'Index', `count = ${this.count}`);
  }

  onCountChange(): void {
    this.message = `${this.count}`;
  }

  build() {
    Column({ space: 12 }) {
      Header('Title')
      Text(this.message)
        .fancy(24)
        .fontColor($r('app.color.primary'))
      TextInput({ text: $$this.message })
      Image($rawfile('logo.png')).width(48)
      List({ scroller: this.scroller }) {
        ForEach(this.tasks, (item: Task, index: number) => {
          ListItem() {
            Row() {
              Text(item.name)
              Blank()
              Toggle({ type: ToggleType.Checkbox, isOn: item.done })
            }
          }
        }, (item: Task) => item.name)
      }
      if (this.selected) {
        Button($r('app.string.ok')).onClick(() => {
          router.pushUrl({ url: 'pages/Detail' });
        })
      } else {
        Divider()
      }
    }
    .width('100%')
    .height('100%')
  }
}

@ComponentV2
struct Child {
  @Param @Require label: string = '';
  @Local count: number = 0;
  @Event onTap: () => void = () => {};

  @Monitor('count')
  onChange(monitor: IMonitor) {
    console.log(`${monitor.value()?.before}`);
  }

  @Computed
  get double(): number {
    return this.count * 2;
  }

  build() {
    Repeat<number>([1, 2, 3]).each((obj: RepeatItem<number>) => {
      Text(`${obj.item}`)
    })
  }
}
