@Entry
@Component
struct Index {
  @State message: string = 'Hello';

  build() {
    Column() {
      Text($r('app.string.ok'))
        .fontColor($r('app.color.primary'))
        .backgroundColor('#80FF0000')
      Image($r('app.media.icon'))
      Image($rawfile('img/logo.png'))
      Text($r('app.string.missing'))
      Image($rawfile('nope.png'))
    }
    .width('100%')
  }
}
