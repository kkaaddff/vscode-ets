// SYNTAX TEST "source.ets" "ArkTS 特有语法"

@Entry
// <- punctuation.decorator.ets
//^^^^ support.function.decorator.arkts.ets
@Component
export struct Index {
// <- keyword.control.export.ets
//     ^^^^^^ storage.type.struct.ets
//            ^^^^^ entity.name.type.class.ets
  @State count: number = 0;
// ^^^^^ support.function.decorator.arkts.ets
//       ^^^^^ variable.object.property.ets
  @MyDeco foo: string = '';
// ^^^^^^ entity.name.function.decorator.ets
  build() {
    Column({ space: 8 }) {
//  ^^^^^^ support.class.component.arkts.ets
      Text($r('app.string.ok')).fontColor('#FF0000')
//    ^^^^ support.class.component.arkts.ets
//         ^^ support.function.resource.arkts.ets
//             ^^^^^^^^^^^^^ string.quoted.single.ets
//                              ^^^^^^^^^ entity.name.function.ets
      TextInput({ text: $$this.count })
//                      ^^ keyword.operator.binding.arkts.ets
//                        ^^^^ variable.language.this.ets
      Repeat<number>([1]).each(() => {})
//    ^^^^^^ support.function.rendering-control.arkts.ets
//           ^^^^^^ support.type.primitive.ets
      ForEach(this.list, (i: number) => {})
//    ^^^^^^^ support.function.rendering-control.arkts.ets
      Image($rawfile('a.png'))
//          ^^^^^^^^ support.function.resource.arkts.ets
    }
    .width('100%')
//  ^ punctuation.accessor.ets
//   ^^^^^ entity.name.function.ets
  }
}

@Extend(Text)
//^^^^^ support.function.decorator.arkts.ets
//      ^^^^ support.class.component.arkts.ets
function fancy() {}

const struct = 1;
//    ^^^^^^ variable.other.constant.ets
//    ^^^^^^ - storage.type.struct.ets
a.Column(1);
//^^^^^^ entity.name.function.ets
//^^^^^^ - support.class.component.arkts.ets
